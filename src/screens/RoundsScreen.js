// src/screens/RoundsScreen.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, SafeAreaView, StatusBar, Alert
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { getMyAssignments, startRound, getActiveRound } from '../services/roundsService';
import * as Haptics from 'expo-haptics';

export default function RoundsScreen({ route, navigation }) {
  const { user } = route.params || {};
  
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeRound, setActiveRound] = useState(null);
  const [starting, setStarting] = useState(null);

  useEffect(() => {
    loadAssignments();
    checkActiveRound();
  }, []);

  const checkActiveRound = async () => {
    const active = await getActiveRound();
    setActiveRound(active);
  };

  const loadAssignments = async () => {
    setLoading(true);
    
    try {
      const result = await getMyAssignments(
        user.car_user_id || user.user_id,
        user.tenant_id || 1
      );
      
      if (result.success) {
        setAssignments(result.data || []);
      } else {
        Alert.alert('Error', result.message || 'No se pudieron cargar las rondas');
      }
    } catch (error) {
      console.error('Error loading assignments:', error);
      Alert.alert('Error', 'Error al cargar rondas');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAssignments();
    await checkActiveRound();
    setRefreshing(false);
  }, []);

  const handleStartRound = async (assignment) => {
    if (activeRound && activeRound.assignment_id !== assignment.assignment_id) {
      Alert.alert(
        '⚠️ Ronda Activa',
        'Ya tienes una ronda en progreso. Debes completarla antes de iniciar otra.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    if (assignment.status === 'completed') {
      Alert.alert('✅ Completada', 'Esta ronda ya fue completada');
      return;
    }
    
    if (assignment.status === 'in_progress') {
      navigation.navigate('ActiveRound', { 
        user, 
        assignmentId: assignment.assignment_id 
      });
      return;
    }
    
    Alert.alert(
      '🚀 Iniciar Ronda',
      `¿Deseas iniciar la ronda "${assignment.roadmap_name}"?\n\nCheckpoints: ${assignment.total_checkpoints || 0}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Iniciar',
          onPress: async () => {
            setStarting(assignment.assignment_id);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            
            const result = await startRound(
              assignment.assignment_id,
              user.car_user_id || user.user_id,
              user.tenant_id || 1
            );
            
            setStarting(null);
            
            if (result.success) {
              setActiveRound({ assignment_id: assignment.assignment_id });
              Alert.alert(
                '✅ Ronda Iniciada',
                'Puedes comenzar a completar checkpoints',
                [
                  {
                    text: 'Ver Ronda',
                    onPress: () => navigation.navigate('ActiveRound', { 
                      user, 
                      assignmentId: assignment.assignment_id 
                    })
                  }
                ]
              );
              loadAssignments();
            } else {
              Alert.alert('Error', result.message || 'No se pudo iniciar la ronda');
            }
          }
        }
      ]
    );
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending':
        return { text: 'PENDIENTE', color: '#64748B', icon: 'schedule' };
      case 'in_progress':
        return { text: 'EN PROGRESO', color: '#F59E0B', icon: 'play-circle' };
      case 'completed':
        return { text: 'COMPLETADA', color: '#10B981', icon: 'check-circle' };
      case 'overdue':
        return { text: 'ATRASADA', color: '#EF4444', icon: 'error' };
      default:
        return { text: 'DESCONOCIDO', color: '#94A3B8', icon: 'help' };
    }
  };

  const renderAssignment = ({ item }) => {
    const statusBadge = getStatusBadge(item.status);
    const isStarting = starting === item.assignment_id;
    const completedCheckpoints = item.completed_checkpoints || 0;
    const totalCheckpoints = item.total_checkpoints || 0;
    const progress = totalCheckpoints > 0 ? (completedCheckpoints / totalCheckpoints) * 100 : 0;

    return (
      <TouchableOpacity
        style={[
          styles.card,
          item.status === 'in_progress' && styles.cardActive
        ]}
        onPress={() => {
          if (item.status === 'completed') {
            Alert.alert('Completada', 'Esta ronda ya fue completada');
          } else if (item.status === 'in_progress') {
            navigation.navigate('ActiveRound', { 
              user, 
              assignmentId: item.assignment_id 
            });
          } else {
            handleStartRound(item);
          }
        }}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <MaterialCommunityIcons name="map-marker-path" size={24} color="#8B5CF6" />
            <View style={styles.cardTitle}>
              <Text style={styles.roadmapName}>{item.roadmap_name}</Text>
              <Text style={styles.clientName}>{item.client_name}</Text>
            </View>
          </View>
          
          <View style={[styles.statusBadge, { backgroundColor: `${statusBadge.color}20` }]}>
            <MaterialIcons name={statusBadge.icon} size={14} color={statusBadge.color} />
            <Text style={[styles.statusText, { color: statusBadge.color }]}>
              {statusBadge.text}
            </Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.infoRow}>
            <MaterialIcons name="access-time" size={16} color="#94A3B8" />
            <Text style={styles.infoText}>
              Inicio: {item.scheduled_time || 'No especificado'}
            </Text>
          </View>
          
          <View style={styles.infoRow}>
            <MaterialIcons name="flag" size={16} color="#94A3B8" />
            <Text style={styles.infoText}>
              Checkpoints: {completedCheckpoints}/{totalCheckpoints}
            </Text>
          </View>
          
          {item.status === 'in_progress' && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${progress}%` }]} />
              </View>
              <Text style={styles.progressText}>{Math.round(progress)}%</Text>
            </View>
          )}
        </View>

        <View style={styles.cardFooter}>
          {item.status === 'pending' && (
            <TouchableOpacity
              style={styles.startButton}
              onPress={() => handleStartRound(item)}
              disabled={isStarting}
            >
              {isStarting ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <MaterialIcons name="play-arrow" size={20} color="#FFF" />
                  <Text style={styles.startButtonText}>Iniciar Ronda</Text>
                </>
              )}
            </TouchableOpacity>
          )}
          
          {item.status === 'in_progress' && (
            <TouchableOpacity
              style={[styles.startButton, styles.continueButton]}
              onPress={() => navigation.navigate('ActiveRound', { 
                user, 
                assignmentId: item.assignment_id 
              })}
            >
              <MaterialIcons name="trending-flat" size={20} color="#FFF" />
              <Text style={styles.startButtonText}>Continuar</Text>
            </TouchableOpacity>
          )}
          
          {item.status === 'completed' && (
            <View style={styles.completedBadge}>
              <MaterialIcons name="check-circle" size={16} color="#10B981" />
              <Text style={styles.completedText}>Completada</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text style={styles.loadingText}>Cargando rondas...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mis Rondas</Text>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
          <MaterialIcons name="refresh" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>

      {activeRound && (
        <View style={styles.activeRoundBanner}>
          <MaterialIcons name="info" size={20} color="#F59E0B" />
          <Text style={styles.activeRoundText}>Tienes una ronda en progreso</Text>
        </View>
      )}

      <FlatList
        data={assignments}
        renderItem={renderAssignment}
        keyExtractor={item => item.assignment_id?.toString()}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8B5CF6" />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons name="map-marker-off" size={64} color="#64748B" />
            <Text style={styles.emptyTitle}>Sin Rondas Asignadas</Text>
            <Text style={styles.emptyText}>
              No tienes rondas asignadas para hoy
            </Text>
            <TouchableOpacity style={styles.emptyButton} onPress={onRefresh}>
              <Text style={styles.emptyButtonText}>Actualizar</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 16,
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  refreshButton: {
    padding: 8,
  },
  activeRoundBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#FDE68A',
  },
  activeRoundText: {
    color: '#92400E',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 8,
  },
  list: {
    padding: 16,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardActive: {
    borderColor: '#F59E0B',
    borderWidth: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    flex: 1,
  },
  cardTitle: {
    marginLeft: 12,
    flex: 1,
  },
  roadmapName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  clientName: {
    fontSize: 13,
    color: '#94A3B8',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  cardBody: {
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoText: {
    color: '#CBD5E1',
    fontSize: 13,
    marginLeft: 8,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#334155',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#F59E0B',
    borderRadius: 4,
  },
  progressText: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 8,
    width: 40,
    textAlign: 'right',
  },
  cardFooter: {
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 12,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8B5CF6',
    paddingVertical: 12,
    borderRadius: 12,
  },
  continueButton: {
    backgroundColor: '#F59E0B',
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  completedText: {
    color: '#10B981',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: '#8B5CF6',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
