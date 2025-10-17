// src/services/sentinelService.js - VERSIÓN PRODUCCIÓN PARA ZEBRA
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import axios from 'axios';
import { API_CONFIG, ENDPOINTS } from '../config/api';
import { getData, saveData, STORAGE_KEYS } from '../utils/storage';

const GPS_TASK_NAME = 'SENTINEL_GPS_TRACKING';

// Configuración optimizada para Zebra
const ZEBRA_GPS_CONFIG = {
  DURING_SHIFT: 180000,     // 3 minutos
  OFF_SHIFT: 600000,        // 10 minutos
  accuracy: Location.Accuracy.Balanced,
  distanceInterval: 1,
  foregroundService: {
    notificationTitle: 'SGS Tracking',  // ✅ Más corto
    notificationBody: 'Activo',          // ✅ Más discreto
    notificationColor: '#3B82F6',
    killServiceOnDestroy: false,
    notificationPriority: 'low'          // ✅ Prioridad baja = menos visible
  },
  pausesUpdatesAutomatically: false,
  activityType: Location.ActivityType.Other,
  showsBackgroundLocationIndicator: false  // ✅ Sin icono de ubicación
};

let consecutiveErrors = 0;

// =============================================
// TASK EN BACKGROUND
// =============================================

TaskManager.defineTask(GPS_TASK_NAME, async ({ data: { locations }, error }) => {
  if (error) {
    console.error('GPS Task Error:', error);
    consecutiveErrors++;
    if (consecutiveErrors >= 3) {
      setTimeout(() => autoRecoverGPS(), 30000);
    }
    return;
  }

  if (!locations || locations.length === 0) return;

  const location = locations[0];
  
  try {
    await sendLocationToServer(location);
    consecutiveErrors = 0;
  } catch (error) {
    consecutiveErrors++;
    const user = await getData(STORAGE_KEYS.USER);
    const zones = await getData(STORAGE_KEYS.ZONES);
    const userZone = zones?.sentinel?.[0] || zones?.all?.find(z => z.is_sentinel_zone);
    await saveOfflineGPSPosition(location, userZone?.zone_id, user);
  }
});

// =============================================
// ENVÍO AL SERVIDOR
// =============================================

const sendLocationToServer = async (location, retryCount = 0) => {
  const user = await getData(STORAGE_KEYS.USER);
  
  if (!user?.tenant_id || !user?.access?.hasSentinel) {
    throw new Error('Usuario sin permisos');
  }

  const zones = await getData(STORAGE_KEYS.ZONES);
  const userZone = zones?.sentinel?.[0] || zones?.all?.find(z => z.is_sentinel_zone);
  
  if (!userZone) {
    throw new Error('Sin zona Sentinel');
  }

  const trackingData = {
    user_id: user.car_user_id || user.user_id,
    tenant_id: user.tenant_id,
    zone_id: userZone.zone_id,
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy: location.coords.accuracy,
    speed: location.coords.speed || 0,
    timestamp: new Date(location.timestamp).toISOString(),
    device_info: 'Zebra - Sentinel'
  };

  try {
    const response = await axios.post(
      `${API_CONFIG.BASE_URL}${ENDPOINTS.SENTINEL_TRACK}`,
      trackingData,
      { 
        timeout: 20000,
        headers: { 'Content-Type': 'application/json' }
      }
    );

    if (response.data.success) {
      await saveData(STORAGE_KEYS.LAST_GPS_POSITION, {
        ...trackingData,
        synced: true,
        sent_at: new Date().toISOString()
      });
      return true;
    } else {
      throw new Error(response.data.error || 'Error del servidor');
    }
  } catch (error) {
    if (retryCount === 0) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      return sendLocationToServer(location, 1);
    }
    throw error;
  }
};

// =============================================
// GUARDAR OFFLINE
// =============================================

const saveOfflineGPSPosition = async (location, zoneId, user) => {
  try {
    if (!user?.tenant_id) return;
    
    const pendingPositions = await getData(STORAGE_KEYS.PENDING_GPS) || [];
    
    const offlinePosition = {
      user_id: user.car_user_id || user.user_id,
      tenant_id: user.tenant_id,
      zone_id: zoneId,
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy,
      speed: location.coords.speed || 0,
      timestamp: new Date(location.timestamp).toISOString(),
      device_info: 'Zebra - Offline',
      offline_id: `gps_${Date.now()}`,
      queued_at: new Date().toISOString()
    };

    if (pendingPositions.length >= 50) {
      pendingPositions.shift();
    }

    pendingPositions.push(offlinePosition);
    await saveData(STORAGE_KEYS.PENDING_GPS, pendingPositions);
  } catch (error) {
    console.error('Error guardando offline:', error);
  }
};

// =============================================
// INICIAR TRACKING
// =============================================

export const startGPSTracking = async () => {
  try {
    const user = await getData(STORAGE_KEYS.USER);
    
    if (!user) {
      return { success: false, message: 'No hay sesión de usuario' };
    }
    
    if (!user.tenant_id || !user.access?.hasSentinel) {
      return { success: false, message: 'Sin permisos Sentinel' };
    }

    const zones = await getData(STORAGE_KEYS.ZONES);
    const userZone = zones?.sentinel?.[0] || zones?.all?.find(z => z.is_sentinel_zone);
    
    if (!userZone) {
      return { success: false, message: 'Sin zona Sentinel asignada' };
    }

    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      return { success: false, message: 'Permisos denegados' };
    }

    await Location.requestBackgroundPermissionsAsync();

    const isRunning = await Location.hasStartedLocationUpdatesAsync(GPS_TASK_NAME);
    if (isRunning) {
      return { success: true, message: 'GPS ya activo', alreadyRunning: true };
    }

    await Location.startLocationUpdatesAsync(GPS_TASK_NAME, {
      accuracy: ZEBRA_GPS_CONFIG.accuracy,
      timeInterval: ZEBRA_GPS_CONFIG.DURING_SHIFT,
      distanceInterval: ZEBRA_GPS_CONFIG.distanceInterval,
      deferredUpdatesInterval: ZEBRA_GPS_CONFIG.DURING_SHIFT,
      foregroundService: {
        notificationTitle: 'SGS Tracking',
        notificationBody: 'Activo',  // ✅ Sin mostrar zona
        notificationColor: '#3B82F6',
        killServiceOnDestroy: false,
        notificationPriority: 'low'
      },
      pausesUpdatesAutomatically: ZEBRA_GPS_CONFIG.pausesUpdatesAutomatically,
      activityType: ZEBRA_GPS_CONFIG.activityType,
      showsBackgroundLocationIndicator: false
    });

    await saveData(STORAGE_KEYS.GPS_TRACKING_ACTIVE, true);

    // ✅ SIN ALERT NI CONSOLE.LOG MOLESTO - Solo retorna el resultado
    return { 
      success: true, 
      message: 'GPS iniciado',
      interval: '3 minutos',
      zone: userZone.zone_name
    };

  } catch (error) {
    // ✅ Solo error en consola, sin Alert
    console.error('Error iniciando GPS:', error);
    return { success: false, message: error.message };
  }
};

// =============================================
// DETENER TRACKING
// =============================================

export const stopGPSTracking = async () => {
  try {
    const isRunning = await Location.hasStartedLocationUpdatesAsync(GPS_TASK_NAME);
    
    if (isRunning) {
      await Location.stopLocationUpdatesAsync(GPS_TASK_NAME);
      await saveData(STORAGE_KEYS.GPS_TRACKING_ACTIVE, false);
      return { success: true, message: 'GPS detenido' };
    }
    
    return { success: true, message: 'GPS no estaba activo' };
    
  } catch (error) {
    return { success: false, message: error.message };
  }
};

// =============================================
// AUTO-RECUPERACIÓN
// =============================================

const autoRecoverGPS = async () => {
  try {
    const user = await getData(STORAGE_KEYS.USER);
    if (!user?.access?.hasSentinel) return false;

    const isRunning = await Location.hasStartedLocationUpdatesAsync(GPS_TASK_NAME);
    if (isRunning) return true;

    const result = await startGPSTracking();
    return result.success;
  } catch (error) {
    return false;
  }
};

// =============================================
// FUNCIONES DE ESTADO
// =============================================

export const isGPSTrackingActive = async () => {
  try {
    const isRunning = await Location.hasStartedLocationUpdatesAsync(GPS_TASK_NAME);
    const savedState = await getData(STORAGE_KEYS.GPS_TRACKING_ACTIVE);
    
    if (isRunning !== savedState) {
      await saveData(STORAGE_KEYS.GPS_TRACKING_ACTIVE, isRunning);
    }
    
    return isRunning;
  } catch (error) {
    return false;
  }
};

export const getTrackingStats = async () => {
  try {
    const isActive = await isGPSTrackingActive();
    const lastPosition = await getData(STORAGE_KEYS.LAST_GPS_POSITION);
    const pendingPositions = await getData(STORAGE_KEYS.PENDING_GPS) || [];
    
    return {
      isActive,
      lastPosition,
      pendingCount: pendingPositions.length,
      lastSyncAt: lastPosition?.sent_at || null,
      consecutiveErrors,
      currentInterval: '3 minutos',
      device: 'Zebra',
      robust: true
    };
  } catch (error) {
    return {
      isActive: false,
      pendingCount: 0,
      robust: false
    };
  }
};

export const syncPendingGPS = async () => {
  try {
    const pendingPositions = await getData(STORAGE_KEYS.PENDING_GPS) || [];
    
    if (pendingPositions.length === 0) {
      return { success: true, synced: 0, failed: 0 };
    }

    let successCount = 0;
    const failedPositions = [];

    for (const position of pendingPositions) {
      try {
        const response = await axios.post(
          `${API_CONFIG.BASE_URL}${ENDPOINTS.SENTINEL_TRACK}`,
          position,
          { timeout: 15000 }
        );

        if (response.data.success) {
          successCount++;
        } else {
          failedPositions.push(position);
        }
      } catch (error) {
        failedPositions.push(position);
      }
    }

    await saveData(STORAGE_KEYS.PENDING_GPS, failedPositions);

    return {
      success: true,
      synced: successCount,
      failed: failedPositions.length
    };

  } catch (error) {
    return { success: false, synced: 0, failed: 0 };
  }
};

export const getCurrentPosition = async () => {
  try {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
      maximumAge: 10000
    });

    return {
      success: true,
      data: {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
        timestamp: new Date(location.timestamp).toISOString()
      }
    };
    
  } catch (error) {
    return { success: false, message: error.message };
  }
};
