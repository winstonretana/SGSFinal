// src/screens/ActiveRoundScreen.js
// Auto-refresh c/30s, animación de progreso, siguiente checkpoint, estadísticas

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  RefreshControl, SafeAreaView, StatusBar, Animated, ActivityIndicator
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { getActiveAssignment, getRoadmap } from '../services/roundsService';
import { getNextAllowedCheckpoint, calculateProgress } from '../utils/checkpointValidator';
import * as Location from 'expo-location';

export default function ActiveRoundScreen({ route, navigation }) {
  const { user } = route.params || {};
  
  const [assignment, setAssignment] = useState(null);
  const [checkpoints, setCheckpoints] = useState([]);
  const [completedCheckpoints, setCompletedCheckpoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [animatedProgress] = useState(new Animated.Value(0));
  const [nextCheckpoint, setNextCheckpoint] = useState(null);

  // Auto-refresh cada 30 segundos
  useEffect(() => {
    loadData();
    
    const interval = setInterval(() => {
      console.log('Auto-refreshing data...');
      loadData(true); // Silent refresh
    }, 30000); // 30 segundos

    return () => clearInterval(interval);
  }, []);

  // Animar progreso
  useEffect(() => {
    Animated.spring(animatedProgress, {
      toValue: progress,
      useNativeDriver: false,
      friction: 8,
      tension: 40,
    }).start();
  }, [progress]);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    
    try {
      // Obtener asignación activa
      const activeAssignment = await getActiveAssignment(user.user_id);
      
      if (!activeAssignment) {
        setAssignment(null);
        setLoading(false);
        return;
      }

      setAssignment(activeAssignment);

      // Obtener roadmap completo
      const roadmapData = await getRoadmap(activeAssignment.roadmap_assignment_id);
      
      const allCheckpoints = roadmapData.checkpoints || [];
      const completed = allCheckpoints.filter(cp => cp.status === 'completed');
      const completedIds = completed.map(cp => cp.roadmap_zone_id);
      
      setCheckpoints(allCheckpoints);
      setCompletedCheckpoints(completed);
      
      // Calcular progreso
      const progressPercent = calculateProgress(completed, allCheckpoints);
      setProgress(progressPercent);

      // Determinar siguiente checkpoint permitido
      const next = getNextAllowedCheckpoint(completed, allCheckpoints);
      setNextCheckpoint(next);

    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, []);

  const handleCheckpointPress = (checkpoint) => {
    navigation.navigate('CheckpointDetailScreen', {
      user,
      assignmentId: assignment.roadmap_assignment_id,
      checkpoint,
      completedCheckpoints,
      allCheckpoints: checkpoints
    });
  };

  const getStatusIcon = (checkpoint) => {
    if (checkpoint.status === 'completed') {
      return { name: 'check-circle', color: '#10B981' };
    } else if (checkpoint.status === 'skipped') {
      return { name: 'skip-next', color: '#F59E0B' };
    } else if (nextCheckpoint && checkpoint.roadmap_zone_id === nextCheckpoint.roadmap_zone_id) {
      return { name: 'play-circle', color: '#8B5CF6' };
    } else {
      return { name: 'radio-button-unchecked', color: '#475569' };
    }
  };

  const getStatusBadge = (checkpoint) => {
    if (checkpoint.status === 'completed') {
      return { text: '✅ Completado', color: '#10B981' };
    } else if (checkpoint.status === 'skipped') {
      return { text: '⏭️ Saltado', color: '#F59E0B' };
    } else if (nextCheckpoint && checkpoint.roadmap_zone_id === nextCheckpoint.roadmap_zone_id) {
      return { text: '▶️ Siguiente', color: '#8B5CF6' };
    } else {
      return { text: '🔒 Bloqueado', color: '#475569' };
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text style={styles.loadingText}>Cargando ronda...</Text>
      </View>
    );
  }

  if (!assignment) {
    return (
      <View style={styles.center}>
        <MaterialCommunityIcons name="clipboard-text-off" size={80} color="#64748B" />
        <Text style={styles.emptyText}>No hay ronda activa</Text>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const progressWidth = animatedProgress.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  const stats = {
    total: checkpoints.length,
    completed: completedCheckpoints.filter(cp => cp.status === 'completed').length,
    skipped: completedCheckpoints.filter(cp => cp.status === 'skipped').length,
    remaining: checkpoints.length - completedCheckpoints.length,
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBackButton}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Ronda Activa</Text>
          <Text style={styles.headerSubtitle}>{assignment.roadmap_name}</Text>
        </View>
        <TouchableOpacity onPress={() => loadData()} style={styles.refreshButton}>
          <MaterialIcons name="refresh" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#8B5CF6"
            colors={['#8B5CF6']}
          />
        }
      >
        {/* PROGRESO */}
        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressTitle}>Progreso General</Text>
            <Text style={styles.progressPercent}>{progress}%</Text>
          </View>
          
          <View style={styles.progressBarContainer}>
            <Animated.View 
              style={[
                styles.progressBarFill, 
                { width: progressWidth }
              ]} 
            />
          </View>

          {/* Estadísticas */}
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <MaterialIcons name="check-circle" size={24} color="#10B981" />
              <Text style={styles.statValue}>{stats.completed}</Text>
              <Text style={styles.statLabel}>Completados</Text>
            </View>
            <View style={styles.statItem}>
              <MaterialIcons name="pending" size={24} color="#F59E0B" />
              <Text style={styles.statValue}>{stats.remaining}</Text>
              <Text style={styles.statLabel}>Pendientes</Text>
            </View>
            <View style={styles.statItem}>
              <MaterialIcons name="skip-next" size={24} color="#64748B" />
              <Text style={styles.statValue}>{stats.skipped}</Text>
              <Text style={styles.statLabel}>Saltados</Text>
            </View>
          </View>
        </View>

        {/* SIGUIENTE CHECKPOINT */}
        {nextCheckpoint && (
          <TouchableOpacity 
            style={styles.nextCheckpointCard}
            onPress={() => handleCheckpointPress(nextCheckpoint)}
          >
            <View style={styles.nextCheckpointHeader}>
              <MaterialIcons name="play-circle" size={32} color="#8B5CF6" />
              <View style={styles.nextCheckpointInfo}>
                <Text style={styles.nextCheckpointLabel}>SIGUIENTE</Text>
                <Text style={styles.nextCheckpointName}>
                  #{nextCheckpoint.sequence_order} - {nextCheckpoint.zone_name}
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={28} color="#8B5CF6" />
            </View>
          </TouchableOpacity>
        )}

        {/* LISTA DE CHECKPOINTS */}
        <View style={styles.checkpointsCard}>
          <Text style={styles.cardTitle}>Todos los Checkpoints</Text>
          
          {checkpoints.map((checkpoint) => {
            const statusIcon = getStatusIcon(checkpoint);
            const statusBadge = getStatusBadge(checkpoint);
            const isNext = nextCheckpoint && checkpoint.roadmap_zone_id === nextCheckpoint.roadmap_zone_id;
            
            return (
              <TouchableOpacity
                key={checkpoint.roadmap_zone_id}
                style={[
                  styles.checkpointItem,
                  isNext && styles.checkpointItemNext
                ]}
                onPress={() => handleCheckpointPress(checkpoint)}
              >
                <MaterialIcons 
                  name={statusIcon.name} 
                  size={28} 
                  color={statusIcon.color} 
                />
                
                <View style={styles.checkpointInfo}>
                  <Text style={styles.checkpointName}>
                    #{checkpoint.sequence_order} - {checkpoint.zone_name}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: statusBadge.color + '20' }]}>
                    <Text style={[styles.statusBadgeText, { color: statusBadge.color }]}>
                      {statusBadge.text}
                    </Text>
                  </View>
                </View>

                <MaterialIcons name="chevron-right" size={24} color="#64748B" />
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
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
    padding: 20,
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 16,
    marginTop: 16,
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 18,
    marginTop: 16,
    marginBottom: 24,
  },
  backButton: {
    backgroundColor: '#8B5CF6',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  headerBackButton: {
    padding: 8,
  },
  headerContent: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 2,
  },
  refreshButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  progressCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
  },
  progressPercent: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#8B5CF6',
  },
  progressBarContainer: {
    height: 12,
    backgroundColor: '#334155',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 20,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#8B5CF6',
    borderRadius: 6,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
    gap: 8,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
  },
  statLabel: {
    fontSize: 12,
    color: '#94A3B8',
  },
  nextCheckpointCard: {
    backgroundColor: '#8B5CF6',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  nextCheckpointHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  nextCheckpointInfo: {
    flex: 1,
  },
  nextCheckpointLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#E9D5FF',
    marginBottom: 4,
  },
  nextCheckpointName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
  },
  checkpointsCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 16,
  },
  checkpointItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#0F172A',
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
  },
  checkpointItemNext: {
    borderWidth: 2,
    borderColor: '#8B5CF6',
  },
  checkpointInfo: {
    flex: 1,
  },
  checkpointName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 6,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
