// src/screens/PTTScreen.js
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  SafeAreaView, StatusBar, Animated, Alert
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  initializePTT, startRecording, stopRecording,
  subscribe, isConnected, disconnectPTT
} from '../services/pttService';

export default function PTTScreen({ route, navigation }) {
  const { user } = route.params || {};
  
  const [connected, setConnected] = useState(false);
  const [recording, setRecording] = useState(false);
  const [currentSpeaker, setCurrentSpeaker] = useState(null);
  const [userCount, setUserCount] = useState(0);
  const [pulseAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    initialize();
    
    const unsubscribe = subscribe((event) => {
      handlePTTEvent(event);
    });
    
    return () => {
      unsubscribe();
      disconnectPTT();
    };
  }, []);

  useEffect(() => {
    if (currentSpeaker) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 500,
            useNativeDriver: true
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true
          })
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [currentSpeaker]);

  const initialize = async () => {
    const result = await initializePTT(user);
    if (!result.success) {
      Alert.alert('Error', result.message);
    }
  };

  const handlePTTEvent = (event) => {
    switch (event.event) {
      case 'connected':
        setConnected(true);
        break;
      case 'disconnected':
        setConnected(false);
        break;
      case 'users_updated':
        setUserCount((event.data || []).length);
        break;
      case 'speaker_changed':
        setCurrentSpeaker(event.data);
        break;
      case 'recording_started':
        setRecording(true);
        break;
      case 'recording_stopped':
        setRecording(false);
        break;
    }
  };

  const handlePTTPress = async () => {
    if (!connected) {
      Alert.alert('Error', 'No conectado al servidor PTT');
      return;
    }
    
    if (currentSpeaker && currentSpeaker !== user.name) {
      Alert.alert('Ocupado', `${currentSpeaker} esta hablando`);
      return;
    }
    
    await startRecording(user);
  };

  const handlePTTRelease = async () => {
    await stopRecording(user);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>WALKIE-TALKIE PTT</Text>
        <View style={[styles.statusDot, connected && styles.statusDotConnected]} />
      </View>

      <View style={styles.channelInfo}>
        <MaterialCommunityIcons name="radio-tower" size={32} color="#3B82F6" />
        <Text style={styles.channelText}>
          Canal: Tenant {user.tenant_id} - Cliente {user.client_id}
        </Text>
        <Text style={styles.usersCount}>
          {userCount} usuarios conectados
        </Text>
      </View>

      <View style={styles.speakerSection}>
        {currentSpeaker ? (
          <Animated.View 
            style={[
              styles.speakerActive,
              { transform: [{ scale: pulseAnim }] }
            ]}
          >
            <MaterialIcons name="mic" size={48} color="#EF4444" />
            <Text style={styles.speakerName}>{currentSpeaker}</Text>
            <Text style={styles.speakerStatus}>TRANSMITIENDO</Text>
          </Animated.View>
        ) : (
          <View style={styles.speakerIdle}>
            <MaterialIcons name="mic-off" size={48} color="#475569" />
            <Text style={styles.idleText}>Canal disponible</Text>
          </View>
        )}
      </View>

      <View style={styles.pttContainer}>
        <TouchableOpacity
          style={[styles.pttButton, recording && styles.pttButtonActive]}
          onPressIn={handlePTTPress}
          onPressOut={handlePTTRelease}
          activeOpacity={0.8}
          disabled={!connected}
        >
          <MaterialIcons 
            name={recording ? "mic" : "mic-none"} 
            size={80} 
            color="#FFFFFF" 
          />
          {recording && (
            <Animated.View 
              style={[
                styles.pttRipple,
                { transform: [{ scale: pulseAnim }] }
              ]} 
            />
          )}
        </TouchableOpacity>
        
        <Text style={styles.pttLabel}>
          {recording ? 'TRANSMITIENDO' : 'MANTENER PARA HABLAR'}
        </Text>
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
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: '#1E293B',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#EF4444',
  },
  statusDotConnected: {
    backgroundColor: '#10B981',
  },
  channelInfo: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#1E293B',
    marginTop: 1,
  },
  channelText: {
    fontSize: 14,
    color: '#FFFFFF',
    marginTop: 8,
  },
  usersCount: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
  },
  speakerSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  speakerActive: {
    alignItems: 'center',
    backgroundColor: '#7F1D1D',
    padding: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#EF4444',
    minWidth: 280,
  },
  speakerIdle: {
    alignItems: 'center',
    backgroundColor: '#1E293B',
    padding: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
    minWidth: 280,
  },
  speakerName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 16,
  },
  speakerStatus: {
    fontSize: 14,
    color: '#FCA5A5',
    marginTop: 8,
    letterSpacing: 2,
  },
  idleText: {
    fontSize: 20,
    color: '#94A3B8',
    marginTop: 16,
  },
  pttContainer: {
    alignItems: 'center',
    paddingBottom: 40,
  },
  pttButton: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 10,
  },
  pttButtonActive: {
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
  },
  pttRipple: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  pttLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 20,
  },
});
