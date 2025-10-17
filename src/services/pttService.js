// src/services/pttService.js - CON TASKMANAGER
import { Audio } from 'expo-av';
import { Vibration, AppState } from 'react-native';
import { io } from 'socket.io-client';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { getData, STORAGE_KEYS } from '../utils/storage';

const PTT_SERVER_URL = 'https://ptt.suppcenter.global:3001';
const SAMPLE_RATE = 16000;
const PTT_KEEPALIVE_TASK = 'PTT_KEEPALIVE_TASK';

let socket = null;
let recording = null;
let sound = null;
let isRecording = false;
let listeners = [];
let activeUsers = [];
let currentSpeaker = null;

// =============================================
// TASK PARA MANTENER PTT VIVO
// =============================================

TaskManager.defineTask(PTT_KEEPALIVE_TASK, async () => {
  try {
    // Este task se ejecuta periódicamente para mantener el proceso vivo
    const isActive = await getData('PTT_ACTIVE');
    
    if (isActive && socket && !socket.connected) {
      console.log('🔄 PTT reconectando desde background...');
      socket.connect();
    }
    
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    console.error('Error en PTT keepalive task:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// =============================================
// REGISTRAR BACKGROUND FETCH
// =============================================

const registerBackgroundTask = async () => {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(PTT_KEEPALIVE_TASK);
    
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(PTT_KEEPALIVE_TASK, {
        minimumInterval: 60, // 1 minuto
        stopOnTerminate: false,
        startOnBoot: true,
      });
      console.log('✅ Background task PTT registrado');
    }
  } catch (error) {
    console.log('⚠️ Error registrando background task:', error);
  }
};

// =============================================
// INICIALIZACIÓN
// =============================================

export const initializePTT = async (user) => {
  try {
    console.log('🎙️ Inicializando PTT...');
    
    // Permisos de audio
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') {
      return { success: false, message: 'Permisos denegados' };
    }
    
    await Audio.setAudioModeAsync({
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
    
    // ✅ REGISTRAR BACKGROUND TASK
    await registerBackgroundTask();
    
    // Socket.io con configuración agresiva
    socket = io(PTT_SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      pingInterval: 5000,
      pingTimeout: 10000,
      upgrade: true,
      rememberUpgrade: true,
    });
    
    let keepAliveInterval;
    
    socket.on('connect', () => {
      console.log('✅ PTT conectado:', socket.id);
      
      const channelId = `tenant_${user.tenant_id}_client_${user.client_id}`;
      socket.emit('join_channel', {
        userId: user.car_user_id || user.user_id,
        userName: user.name || `${user.first_name} ${user.last_name}`,
        tenantId: user.tenant_id,
        clientId: user.client_id,
        channelId
      });
      
      // Ping manual cada 3 segundos
      if (keepAliveInterval) clearInterval(keepAliveInterval);
      keepAliveInterval = setInterval(() => {
        if (socket && socket.connected) {
          socket.emit('ping', { timestamp: Date.now() });
        }
      }, 3000);
      
      notifyListeners('connected');
    });
    
    socket.on('pong', (data) => {
      // Conexión viva
    });
    
    socket.on('connect_error', (error) => {
      console.log('❌ Error conexión:', error.message);
    });
    
    socket.on('disconnect', (reason) => {
      console.log('🔌 Desconectado:', reason);
      
      if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
      }
      
      if (reason === 'io server disconnect') {
        socket.connect();
      }
      
      notifyListeners('disconnected');
    });
    
    socket.on('reconnect', (attemptNumber) => {
      console.log('🔄 Reconectado:', attemptNumber);
    });
    
    socket.on('audio_receive', async (data) => {
      console.log('🔊 Audio recibido');
      await playAudio(data.audioData);
    });
    
    socket.on('user_speaking', (data) => {
      currentSpeaker = data.speaking ? data.userName : null;
      notifyListeners('speaker_changed', currentSpeaker);
      if (data.speaking) Vibration.vibrate(100);
    });
    
    socket.on('active_users', (users) => {
      activeUsers = users;
      notifyListeners('users_updated', users);
    });
    
    socket.on('user_joined', (data) => {
      console.log(`👤 ${data.userName} se unió`);
      notifyListeners('user_joined', data);
    });
    
    socket.on('user_left', (data) => {
      console.log(`👋 ${data.userName} salió`);
      notifyListeners('user_left', data);
    });
    
    // Guardar estado activo
    await saveData('PTT_ACTIVE', true);
    
    return { success: true, message: 'PTT OK' };
    
  } catch (error) {
    console.error('❌ Error init:', error);
    return { success: false, message: error.message };
  }
};

// =============================================
// GRABAR AUDIO
// =============================================

export const startRecording = async (user) => {
  if (isRecording) {
    return { success: false };
  }
  
  try {
    console.log('🔴 INICIANDO GRABACIÓN PTT...');
    
    isRecording = true;
    notifyListeners('recording_started');
    
    socket?.emit('ptt_pressed', {
      userId: user.car_user_id || user.user_id,
      userName: user.name || `${user.first_name} ${user.last_name}`
    });
    
    Vibration.vibrate(200);
    
    recording = new Audio.Recording();
    
    await recording.prepareToRecordAsync({
      isMeteringEnabled: true,
      android: {
        extension: '.m4a',
        outputFormat: 2,
        audioEncoder: 3,
        sampleRate: 44100,
        numberOfChannels: 2,
        bitRate: 128000,
      },
      ios: {
        extension: '.m4a',
        outputFormat: 1,
        audioQuality: 127,
        sampleRate: 44100,
        numberOfChannels: 2,
        bitRate: 128000,
        linearPCMBitDepth: 16,
        linearPCMIsBigEndian: false,
        linearPCMIsFloat: false,
      },
      web: {
        mimeType: 'audio/webm',
        bitsPerSecond: 128000,
      },
    });
    
    await recording.startAsync();
    console.log('✅ GRABACIÓN ACTIVA');
    
    return { success: true };
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    isRecording = false;
    recording = null;
    notifyListeners('recording_error');
    return { success: false, error: error.message };
  }
};

// =============================================
// DETENER GRABACIÓN
// =============================================

export const stopRecording = async (user) => {
  if (!isRecording || !recording) {
    return { success: false };
  }
  
  try {
    console.log('⚪ DETENIENDO GRABACIÓN PTT...');
    
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    
    isRecording = false;
    recording = null;
    
    socket?.emit('ptt_released', {
      userId: user.car_user_id || user.user_id,
      userName: user.name || `${user.first_name} ${user.last_name}`
    });
    
    Vibration.vibrate(100);
    notifyListeners('recording_stopped');
    
    if (uri) {
      try {
        const response = await fetch(uri);
        const blob = await response.blob();
        
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        
        reader.onloadend = () => {
          const base64Audio = reader.result.split(',')[1];
          
          if (base64Audio && socket?.connected) {
            socket.emit('audio_stream', {
              audioData: base64Audio,
              userId: user.car_user_id || user.user_id,
              userName: user.name || `${user.first_name} ${user.last_name}`,
              timestamp: Date.now()
            });
            
            console.log('✅ Audio enviado:', (base64Audio.length / 1024).toFixed(2), 'KB');
          }
        };
      } catch (e) {
        console.error('❌ Error procesando audio:', e);
      }
    }
    
    return { success: true };
    
  } catch (error) {
    console.error('❌ Error deteniendo:', error);
    isRecording = false;
    recording = null;
    notifyListeners('recording_stopped');
    return { success: false, error: error.message };
  }
};

// =============================================
// REPRODUCIR AUDIO
// =============================================

const playAudio = async (base64Audio) => {
  try {
    if (sound) {
      await sound.unloadAsync();
      sound = null;
    }
    
    const dataUri = `data:audio/m4a;base64,${base64Audio}`;
    
    const { sound: newSound } = await Audio.Sound.createAsync(
      { uri: dataUri },
      { shouldPlay: true, volume: 1.0 }
    );
    
    sound = newSound;
    
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.didJustFinish) {
        sound.unloadAsync();
        sound = null;
      }
    });
    
    console.log('✅ Audio reproduciendo');
    
  } catch (error) {
    console.error('❌ Error reproduciendo:', error.message);
  }
};

// =============================================
// UTILIDADES
// =============================================

export const subscribe = (callback) => {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter(cb => cb !== callback);
  };
};

const notifyListeners = (event, data = null) => {
  listeners.forEach(callback => {
    try {
      callback({ event, data });
    } catch (error) {
      console.error('Error en listener:', error);
    }
  });
};

export const getActiveUsers = () => activeUsers;
export const getCurrentSpeaker = () => currentSpeaker;
export const isConnected = () => socket?.connected || false;

export const disconnectPTT = async () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  
  if (recording) {
    await recording.stopAndUnloadAsync();
    recording = null;
  }
  
  if (sound) {
    await sound.unloadAsync();
    sound = null;
  }
  
  // Desregistrar background task
  try {
    await BackgroundFetch.unregisterTaskAsync(PTT_KEEPALIVE_TASK);
  } catch (e) {}
  
  await saveData('PTT_ACTIVE', false);
  
  isRecording = false;
  listeners = [];
  
  console.log('🔌 PTT desconectado');
};

// Función auxiliar (necesitas importar saveData de storage.js)
const saveData = async (key, value) => {
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (e) {}
};
