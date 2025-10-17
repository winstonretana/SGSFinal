// src/services/heartbeatService.js - CON GPS WATCHDOG
import NetInfo from '@react-native-community/netinfo';
import * as Location from 'expo-location';
import axios from 'axios';
import { Alert } from 'react-native';
import { API_CONFIG } from '../config/api';
import { syncAll } from '../utils/sync';
import { getData, STORAGE_KEYS } from '../utils/storage';

let connectionCheckInterval = null;
let gpsCheckInterval = null;
let isOnline = true;
let lastOnlineTime = new Date();
let listeners = [];
let consecutiveFailures = 0;
let gpsWasEnabled = true;
let gpsAlertShown = false;

/**
 * Iniciar heartbeat - Chequea conexión cada 30 segundos
 */
export const startHeartbeat = () => {
  console.log('💓 Heartbeat iniciado');
  
  // Limpiar intervalos anteriores si existen
  if (connectionCheckInterval) {
    clearInterval(connectionCheckInterval);
  }
  if (gpsCheckInterval) {
    clearInterval(gpsCheckInterval);
  }
  
  // Chequeo inicial
  checkConnection();
  checkGPSStatus();
  
  // Chequeo cada 30 segundos
  connectionCheckInterval = setInterval(() => {
    checkConnection();
  }, 30000);
  
  // ✅ GPS Watchdog - Chequeo cada 20 segundos
  gpsCheckInterval = setInterval(() => {
    checkGPSStatus();
  }, 20000);
  
  // Escuchar cambios de red nativos
  NetInfo.addEventListener(state => {
    handleNetworkChange(state);
  });
};

/**
 * Detener heartbeat
 */
export const stopHeartbeat = () => {
  console.log('💔 Heartbeat detenido');
  if (connectionCheckInterval) {
    clearInterval(connectionCheckInterval);
    connectionCheckInterval = null;
  }
  if (gpsCheckInterval) {
    clearInterval(gpsCheckInterval);
    gpsCheckInterval = null;
  }
  listeners = [];
  gpsAlertShown = false;
};

/**
 * ✅ NUEVO - Verificar estado del GPS
 */
const checkGPSStatus = async () => {
  try {
    // Verificar si el usuario tiene permiso Sentinel
    const user = await getData(STORAGE_KEYS.USER);
    if (!user?.access?.hasSentinel) {
      return; // Solo monitorear si tiene GPS habilitado
    }
    
    // Verificar si el GPS tracking está activo
    const isTrackingActive = await getData(STORAGE_KEYS.GPS_TRACKING_ACTIVE);
    if (!isTrackingActive) {
      return; // No monitorear si no ha iniciado tracking
    }
    
    // Verificar si el GPS está habilitado en el dispositivo
    const { status } = await Location.getForegroundPermissionsAsync();
    const isEnabled = await Location.hasServicesEnabledAsync();
    
    const gpsIsOn = status === 'granted' && isEnabled;
    
    if (gpsWasEnabled && !gpsIsOn) {
      // ¡GPS fue apagado!
      console.log('🚨 GPS APAGADO - Enviando alerta');
      handleGPSDisabled();
    } else if (!gpsWasEnabled && gpsIsOn) {
      // GPS fue reactivado
      console.log('✅ GPS reactivado');
      gpsAlertShown = false;
      notifyListeners('gps_enabled');
    }
    
    gpsWasEnabled = gpsIsOn;
    
  } catch (error) {
    console.log('Error verificando GPS:', error);
  }
};

/**
 * ✅ NUEVO - Manejar GPS deshabilitado
 */
const handleGPSDisabled = async () => {
  // Mostrar alerta solo una vez
  if (gpsAlertShown) {
    return;
  }
  gpsAlertShown = true;
  
  // Notificar al UI
  notifyListeners('gps_disabled');
  
  // Mostrar alerta intimidatoria
  Alert.alert(
    '⚠️ GPS DESACTIVADO',
    '🚨 ADVERTENCIA: El GPS ha sido desactivado.\n\n' +
    '• Este evento ha sido registrado y reportado.\n' +
    '• La supervisión será notificada.\n' +
    '• Reactiva el GPS inmediatamente.\n\n' +
    'El tracking GPS es OBLIGATORIO durante tu turno.',
    [
      {
        text: 'Activar GPS',
        onPress: () => {
          // Abrir configuración de ubicación
          Location.enableNetworkProviderAsync().catch(() => {
            // En Android, esto puede fallar, pero al menos lo intentamos
          });
        },
        style: 'default'
      },
      {
        text: 'Entendido',
        style: 'cancel'
      }
    ],
    { cancelable: false }
  );
  
  // ✅ Reportar al backend (opcional)
  await reportGPSDisabled();
};

/**
 * ✅ NUEVO - Reportar GPS apagado al backend
 */
const reportGPSDisabled = async () => {
  try {
    const user = await getData(STORAGE_KEYS.USER);
    if (!user) return;
    
    const reportData = {
      user_id: user.car_user_id || user.user_id,
      tenant_id: user.tenant_id || 1,
      event_type: 'GPS_DISABLED',
      timestamp: new Date().toISOString(),
      device_info: 'Android',
      severity: 'HIGH'
    };
    
    // Usar endpoint de pánico o crear uno nuevo
    await axios.post(
      `${API_CONFIG.BASE_URL}/api/mobile/panic`,
      reportData,
      { timeout: 5000 }
    );
    
    console.log('✅ GPS disabled reportado al backend');
    
  } catch (error) {
    console.log('Error reportando GPS disabled:', error.message);
    // No es crítico si falla el reporte
  }
};

/**
 * Manejar cambios de red detectados por NetInfo
 */
const handleNetworkChange = (state) => {
  const wasOnline = isOnline;
  const nowOnline = state.isConnected && state.isInternetReachable !== false;
  
  console.log(`📡 Cambio de red: ${state.type} - ${nowOnline ? 'ONLINE' : 'OFFLINE'}`);
  
  // Si cambió el estado
  if (wasOnline !== nowOnline) {
    isOnline = nowOnline;
    
    if (nowOnline) {
      // Recuperó conexión
      console.log('✅ Conexión recuperada');
      lastOnlineTime = new Date();
      consecutiveFailures = 0;
      notifyListeners('online');
      
      // Sincronizar después de 2 segundos
      setTimeout(() => {
        console.log('🔄 Iniciando sincronización automática...');
        syncAll().then(result => {
          if (result.totalSynced > 0) {
            console.log(`✅ ${result.totalSynced} items sincronizados tras reconexión`);
            notifyListeners('synced', result);
          }
        }).catch(err => {
          console.error('Error en sync automático:', err);
        });
      }, 2000);
    } else {
      // Perdió conexión
      console.log('❌ Conexión perdida');
      notifyListeners('offline');
    }
  }
};

/**
 * Chequear conexión haciendo ping al servidor
 */
const checkConnection = async () => {
  try {
    // Primero verificar estado de red
    const state = await NetInfo.fetch();
    
    if (!state.isConnected) {
      handleConnectionLost();
      return;
    }
    
    // Usar endpoint existente de versión
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await axios.get(
      `${API_CONFIG.BASE_URL}/api/mobile/version`,
      { 
        params: { tenant_id: 1 },
        timeout: 5000,
        signal: controller.signal
      }
    );
    
    clearTimeout(timeoutId);
    
    // Si llegamos aquí, hay conexión
    if (!isOnline) {
      // Estaba offline y ahora está online
      handleConnectionRecovered();
    } else {
      // Sigue online
      consecutiveFailures = 0;
    }
    
  } catch (error) {
    console.log('⚠️ Ping falló:', error.message);
    consecutiveFailures++;
    
    // Solo marcar como offline después de 2 fallos consecutivos
    if (consecutiveFailures >= 2 && isOnline) {
      handleConnectionLost();
    }
  }
};

/**
 * Manejar pérdida de conexión
 */
const handleConnectionLost = () => {
  if (isOnline) {
    console.log('❌ Conexión perdida (confirmado)');
    isOnline = false;
    notifyListeners('offline');
  }
};

/**
 * Manejar recuperación de conexión
 */
const handleConnectionRecovered = () => {
  console.log('✅ Conexión recuperada (confirmado)');
  isOnline = true;
  lastOnlineTime = new Date();
  consecutiveFailures = 0;
  notifyListeners('online');
  
  // Sincronizar automáticamente
  setTimeout(() => {
    console.log('🔄 Sincronizando tras recuperar conexión...');
    syncAll().then(result => {
      if (result.totalSynced > 0) {
        console.log(`✅ ${result.totalSynced} items sincronizados`);
        notifyListeners('synced', result);
      }
    }).catch(err => {
      console.error('Error en sync:', err);
    });
  }, 2000);
};

/**
 * Suscribirse a cambios de conexión
 */
export const subscribe = (callback) => {
  listeners.push(callback);
  
  // Retornar función para desuscribirse
  return () => {
    listeners = listeners.filter(cb => cb !== callback);
  };
};

/**
 * Notificar a todos los listeners
 */
const notifyListeners = (event, data = null) => {
  listeners.forEach(callback => {
    try {
      callback({ event, data, isOnline, lastOnlineTime });
    } catch (error) {
      console.error('Error en listener:', error);
    }
  });
};

/**
 * Obtener estado actual
 */
export const getConnectionStatus = () => {
  return {
    isOnline,
    lastOnlineTime,
    offlineDuration: isOnline ? 0 : Date.now() - lastOnlineTime.getTime()
  };
};

/**
 * Forzar chequeo de conexión
 */
export const forceCheck = async () => {
  console.log('🔍 Forzando chequeo de conexión...');
  await checkConnection();
  return getConnectionStatus();
};

/**
 * ✅ NUEVO - Forzar chequeo de GPS
 */
export const forceGPSCheck = async () => {
  console.log('🔍 Forzando chequeo de GPS...');
  await checkGPSStatus();
};
