// src/screens/CheckpointDetailScreen.js
// UI idiota-proof con badges de requerimientos, botones grandes y claros

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Alert, SafeAreaView, StatusBar, ActivityIndicator
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { completeCheckpoint, skipCheckpoint, calculateDistance } from '../services/roundsService';
import { canCompleteCheckpoint } from '../utils/checkpointValidator';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';

export default function CheckpointDetailScreen({ route, navigation }) {
  const { user, assignmentId, checkpoint, completedCheckpoints = [], allCheckpoints = [] } = route.params || {};
  
  const [userLocation, setUserLocation] = useState(null);
  const [distance, setDistance] = useState(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getUserLocation();
  }, []);

  const getUserLocation = async () => {
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        timeout: 5000
      });
      
      setUserLocation(location.coords);
      
      if (checkpoint.latitude && checkpoint.longitude) {
        const dist = calculateDistance(
          location.coords.latitude,
          location.coords.longitude,
          parseFloat(checkpoint.latitude),
          parseFloat(checkpoint.longitude)
        );
        setDistance(Math.round(dist));
      }
    } catch (error) {
      console.error('Error getting location:', error);
    }
  };

  const handleScanPress = () => {
    if (!canCompleteCheckpoint(checkpoint, completedCheckpoints, allCheckpoints)) {
      Alert.alert(
        '⚠️ No Disponible',
        'Debes completar los checkpoints anteriores primero',
        [{ text: 'OK' }]
      );
      return;
    }

    navigation.navigate('CheckpointScannerScreen', {
      user,
      assignmentId,
      checkpoint,
      userLocation,
      distance,
      notes,
      completedCheckpoints,
      allCheckpoints
    });
  };

  const handleSkip = () => {
    Alert.alert(
      '⏭️ Saltar Checkpoint',
      '¿Estás seguro de que quieres saltar este checkpoint?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Saltar',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await skipCheckpoint(assignmentId, checkpoint.roadmap_zone_id, notes || 'Saltado');
              Alert.alert('✅ Saltado', 'Checkpoint marcado como saltado');
              navigation.goBack();
            } catch (error) {
              Alert.alert('❌ Error', error.message);
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const getMethodBadge = () => {
    const type = checkpoint.zone_type || 'hybrid';
    const badges = {
      hybrid: { icon: 'qr-code', label: 'QR + NFC', color: '#8B5CF6' },
      qr_only: { icon: 'qr-code-scanner', label: 'Solo QR', color: '#3B82F6' },
      nfc_only: { icon: 'nfc', label: 'Solo NFC', color: '#10B981' }
    };
    return badges[type] || badges.hybrid;
  };

  const methodBadge = getMethodBadge();
  const isBlocked = !canCompleteCheckpoint(checkpoint, completedCheckpoints, allCheckpoints);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          #{checkpoint.sequence_order} - {checkpoint.zone_name}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* REQUERIMIENTOS */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📋 Requerimientos</Text>
          
          {/* Método de escaneo */}
          <View style={[styles.badge, { backgroundColor: methodBadge.color }]}>
            <MaterialIcons name={methodBadge.icon} size={20} color="#FFF" />
            <Text style={styles.badgeText}>{methodBadge.label}</Text>
          </View>

          {/* Distancia GPS */}
          {distance !== null && (
            <View style={[styles.badge, distance <= 50 ? styles.badgeSuccess : styles.badgeWarning]}>
              <MaterialIcons name="location-on" size={20} color="#FFF" />
              <Text style={styles.badgeText}>
                {distance}m {distance <= 50 ? '✓ Cerca' : '⚠️ Lejos'}
              </Text>
            </View>
          )}

          {/* Orden secuencial */}
          {isBlocked && (
            <View style={[styles.badge, styles.badgeError]}>
              <MaterialIcons name="lock" size={20} color="#FFF" />
              <Text style={styles.badgeText}>🔒 Bloqueado - Completa los anteriores</Text>
            </View>
          )}
        </View>

        {/* INFORMACIÓN */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>ℹ️ Información</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Código:</Text>
            <Text style={styles.infoValue}>{checkpoint.zone_code}</Text>
          </View>
          {checkpoint.description && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Descripción:</Text>
              <Text style={styles.infoValue}>{checkpoint.description}</Text>
            </View>
          )}
        </View>

        {/* NOTAS */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📝 Notas (opcional)</Text>
          <TextInput
            style={styles.notesInput}
            placeholder="Agrega observaciones..."
            placeholderTextColor="#64748B"
            multiline
            numberOfLines={4}
            value={notes}
            onChangeText={setNotes}
          />
        </View>
      </ScrollView>

      {/* FOOTER ACTIONS */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.scanButton, isBlocked && styles.buttonDisabled]}
          onPress={handleScanPress}
          disabled={isBlocked || loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <MaterialIcons name="qr-code-scanner" size={28} color="#FFF" />
              <Text style={styles.scanButtonText}>
                {isBlocked ? '🔒 Bloqueado' : '📷 Escanear Checkpoint'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.skipButton}
          onPress={handleSkip}
          disabled={loading}
        >
          <Text style={styles.skipButtonText}>⏭️ Saltar</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
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
  backButton: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
    marginHorizontal: 12,
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 12,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 8,
    gap: 8,
  },
  badgeSuccess: {
    backgroundColor: '#10B981',
  },
  badgeWarning: {
    backgroundColor: '#F59E0B',
  },
  badgeError: {
    backgroundColor: '#EF4444',
  },
  badgeText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  infoRow: {
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    color: '#FFF',
    fontWeight: '500',
  },
  notesInput: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 12,
    color: '#FFF',
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  footer: {
    padding: 16,
    backgroundColor: '#1E293B',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    gap: 12,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8B5CF6',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 12,
  },
  scanButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  skipButton: {
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#334155',
    alignItems: 'center',
  },
  skipButtonText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
