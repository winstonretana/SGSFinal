// src/utils/sync.js - VERSIÓN COMPLETA: Attendance + Sentinel + Rounds
import { getData, saveData, STORAGE_KEYS } from './storage';
import { API_CONFIG, ENDPOINTS } from '../config/api';
import axios from 'axios';
import NetInfo from '@react-native-community/netinfo';

// ✅ CONFIGURACIÓN
const SYNC_CONFIG = {
  MAX_RETRIES: 5,
  TIMEOUT: 8000,
  MAX_AGE_DAYS: 7,
  BATCH_SIZE: 10,
  BACKOFF_BASE: 2000,
};

// Verificar conexión real
const checkConnection = async () => {
  try {
    const state = await NetInfo.fetch();
    console.log('📶 Estado de red:', {
      isConnected: state.isConnected,
      isInternetReachable: state.isInternetReachable,
      type: state.type
    });
    
    if (state.isConnected && state.isInternetReachable !== false) {
      return true;
    }
    return false;
  } catch (error) {
    console.log('Error verificando conexión:', error);
    return true;
  }
};

// Calcular backoff exponencial
const getBackoffDelay = (retryCount) => {
  return Math.min(
    SYNC_CONFIG.BACKOFF_BASE * Math.pow(2, retryCount),
    60000 // Máximo 1 minuto
  );
};

// Verificar si un item debe reintentarse
const shouldRetry = (item) => {
  const retryCount = item.retry_count || 0;
  
  if (retryCount >= SYNC_CONFIG.MAX_RETRIES) {
    return false;
  }
  
  if (item.last_attempt) {
    const timeSinceLastAttempt = Date.now() - new Date(item.last_attempt).getTime();
    const backoffDelay = getBackoffDelay(retryCount);
    
    if (timeSinceLastAttempt < backoffDelay) {
      return false;
    }
  }
  
  return true;
};

// ========================================
// ATTENDANCE (Asistencia)
// ========================================

export const syncPendingMarks = async () => {
  try {
    console.log('=== SINCRONIZACIÓN ATTENDANCE ===');
    
    const isOnline = await checkConnection();
    if (!isOnline) {
      return { 
        success: false, 
        message: 'Sin conexión a internet',
        synced: 0,
        failed: 0
      };
    }

    const pendingMarks = await getData(STORAGE_KEYS.PENDING_MARKS) || [];
    
    if (pendingMarks.length === 0) {
      return { 
        success: true, 
        synced: 0,
        failed: 0,
        message: 'No hay marcas pendientes'
      };
    }

    console.log(`📤 ${pendingMarks.length} marcas pendientes`);
    
    const marksToRetry = pendingMarks.filter(shouldRetry);
    const marksOnHold = pendingMarks.filter(m => !shouldRetry(m));
    
    if (marksToRetry.length === 0) {
      return {
        success: true,
        synced: 0,
        failed: pendingMarks.length,
        message: 'Todas en backoff'
      };
    }
    
    let successCount = 0;
    const failedMarks = [...marksOnHold];
    const rejectedMarks = [];

    // Procesar en lotes
    const batches = [];
    for (let i = 0; i < marksToRetry.length; i += SYNC_CONFIG.BATCH_SIZE) {
      batches.push(marksToRetry.slice(i, i + SYNC_CONFIG.BATCH_SIZE));
    }

    for (const batch of batches) {
      const results = await Promise.allSettled(
        batch.map(mark => sendAttendanceMark(mark))
      );

      results.forEach((result, index) => {
        const mark = batch[index];
        
        if (result.status === 'fulfilled') {
          const { success, rejected, error } = result.value;
          
          if (success) {
            successCount++;
          } else if (rejected) {
            rejectedMarks.push(mark);
          } else {
            failedMarks.push({
              ...mark,
              retry_count: (mark.retry_count || 0) + 1,
              last_attempt: new Date().toISOString(),
              last_error: error
            });
          }
        } else {
          failedMarks.push({
            ...mark,
            retry_count: (mark.retry_count || 0) + 1,
            last_attempt: new Date().toISOString(),
            last_error: result.reason?.message || 'Error desconocido'
          });
        }
      });
    }

    await saveData(STORAGE_KEYS.PENDING_MARKS, failedMarks);
    await saveData(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
    
    console.log(`✅ Attendance: ${successCount} sync, ${failedMarks.length} pending, ${rejectedMarks.length} rejected`);
    
    return {
      success: successCount > 0 || failedMarks.length === 0,
      synced: successCount,
      failed: failedMarks.length,
      rejected: rejectedMarks.length,
      message: `${successCount} sincronizada${successCount !== 1 ? 's' : ''}`
    };

  } catch (error) {
    console.error('❌ Error sync attendance:', error);
    return { 
      success: false, 
      synced: 0,
      failed: 0,
      message: 'Error al sincronizar'
    };
  }
};

const sendAttendanceMark = async (mark) => {
  try {
    const response = await axios.post(
      `${API_CONFIG.BASE_URL}${ENDPOINTS.ATTENDANCE_CHECK}`,
      mark,
      { 
        timeout: SYNC_CONFIG.TIMEOUT,
        headers: { 'Content-Type': 'application/json' },
        validateStatus: (status) => status < 500
      }
    );

    if (response.data.success) {
      return { success: true };
    } else if (response.status === 400) {
      return { success: false, rejected: true, error: response.data.error };
    } else {
      return { success: false, rejected: false, error: response.data.error || 'Error del servidor' };
    }
  } catch (error) {
    return { success: false, rejected: false, error: error.message };
  }
};

export const addPendingMark = async (markData) => {
  try {
    const pendingMarks = await getData(STORAGE_KEYS.PENDING_MARKS) || [];
    
    const isDuplicate = pendingMarks.some(m => 
      m.offline_id === markData.offline_id ||
      (m.timestamp === markData.timestamp && m.attendance_type === markData.attendance_type)
    );
    
    if (isDuplicate) {
      console.log('⚠️ Marca duplicada');
      return true;
    }
    
    pendingMarks.push({
      ...markData,
      queued_at: new Date().toISOString(),
      retry_count: 0,
      last_attempt: null
    });
    
    await saveData(STORAGE_KEYS.PENDING_MARKS, pendingMarks);
    console.log(`💾 Marca agregada. Total: ${pendingMarks.length}`);
    return true;
    
  } catch (error) {
    console.error('Error agregando marca:', error);
    return false;
  }
};

// ========================================
// SENTINEL (GPS Tracking)
// ========================================

export const syncPendingGPS = async () => {
  try {
    console.log('=== SINCRONIZACIÓN SENTINEL ===');
    
    const isOnline = await checkConnection();
    if (!isOnline) {
      return { 
        success: false, 
        message: 'Sin conexión',
        synced: 0,
        failed: 0
      };
    }

    const pendingPositions = await getData(STORAGE_KEYS.PENDING_GPS) || [];
    
    if (pendingPositions.length === 0) {
      return { 
        success: true, 
        synced: 0,
        failed: 0,
        message: 'No hay posiciones pendientes'
      };
    }

    console.log(`📍 ${pendingPositions.length} posiciones pendientes`);
    
    const positionsToRetry = pendingPositions.filter(shouldRetry);
    const positionsOnHold = pendingPositions.filter(p => !shouldRetry(p));
    
    if (positionsToRetry.length === 0) {
      return {
        success: true,
        synced: 0,
        failed: pendingPositions.length,
        message: 'Todas en backoff'
      };
    }
    
    let successCount = 0;
    const failedPositions = [...positionsOnHold];

    // Procesar en lotes
    const batches = [];
    for (let i = 0; i < positionsToRetry.length; i += SYNC_CONFIG.BATCH_SIZE) {
      batches.push(positionsToRetry.slice(i, i + SYNC_CONFIG.BATCH_SIZE));
    }

    for (const batch of batches) {
      const results = await Promise.allSettled(
        batch.map(position => sendGPSPosition(position))
      );

      results.forEach((result, index) => {
        const position = batch[index];
        
        if (result.status === 'fulfilled' && result.value.success) {
          successCount++;
        } else {
          failedPositions.push({
            ...position,
            retry_count: (position.retry_count || 0) + 1,
            last_attempt: new Date().toISOString(),
            last_error: result.value?.error || result.reason?.message || 'Error desconocido'
          });
        }
      });
    }

    await saveData(STORAGE_KEYS.PENDING_GPS, failedPositions);
    
    console.log(`✅ Sentinel: ${successCount} sync, ${failedPositions.length} pending`);
    
    return {
      success: successCount > 0 || failedPositions.length === 0,
      synced: successCount,
      failed: failedPositions.length,
      message: `${successCount} posición${successCount !== 1 ? 'es' : ''} sincronizada${successCount !== 1 ? 's' : ''}`
    };

  } catch (error) {
    console.error('❌ Error sync GPS:', error);
    return { 
      success: false, 
      synced: 0,
      failed: 0,
      message: 'Error al sincronizar GPS'
    };
  }
};

const sendGPSPosition = async (position) => {
  try {
    const response = await axios.post(
      `${API_CONFIG.BASE_URL}${ENDPOINTS.SENTINEL_TRACK}`,
      position,
      { 
        timeout: SYNC_CONFIG.TIMEOUT,
        headers: { 'Content-Type': 'application/json' }
      }
    );

    if (response.data.success) {
      return { success: true };
    } else {
      return { success: false, error: response.data.error || 'Error del servidor' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const addPendingGPS = async (positionData) => {
  try {
    const pendingPositions = await getData(STORAGE_KEYS.PENDING_GPS) || [];
    
    // Limitar a 50 posiciones
    if (pendingPositions.length >= 50) {
      pendingPositions.shift(); // Eliminar la más antigua
    }
    
    pendingPositions.push({
      ...positionData,
      queued_at: new Date().toISOString(),
      retry_count: 0,
      last_attempt: null
    });
    
    await saveData(STORAGE_KEYS.PENDING_GPS, pendingPositions);
    return true;
    
  } catch (error) {
    console.error('Error agregando GPS:', error);
    return false;
  }
};

// ========================================
// ROUNDS (Rondas) - Por si acaso
// ========================================

export const syncPendingRounds = async () => {
  try {
    console.log('=== SINCRONIZACIÓN ROUNDS ===');
    
    // Las rondas normalmente se guardan online
    // Pero si implementas checkpoints offline, aquí irían
    
    const pendingCheckpoints = await getData(STORAGE_KEYS.PENDING_CHECKPOINTS) || [];
    
    if (pendingCheckpoints.length === 0) {
      return { 
        success: true, 
        synced: 0,
        failed: 0,
        message: 'No hay checkpoints pendientes'
      };
    }

    // Implementar lógica similar si es necesario
    console.log(`🗺️ ${pendingCheckpoints.length} checkpoints pendientes (no implementado aún)`);
    
    return {
      success: true,
      synced: 0,
      failed: pendingCheckpoints.length,
      message: 'Sincronización de rounds no implementada'
    };

  } catch (error) {
    console.error('❌ Error sync rounds:', error);
    return { 
      success: false, 
      synced: 0,
      failed: 0,
      message: 'Error al sincronizar rounds'
    };
  }
};

// ========================================
// SINCRONIZACIÓN COMPLETA (TODO)
// ========================================

export const syncAll = async () => {
  try {
    console.log('========== SINCRONIZACIÓN COMPLETA ==========');
    
    const isOnline = await checkConnection();
    if (!isOnline) {
      return {
        success: false,
        message: 'Sin conexión a internet',
        attendance: { synced: 0, failed: 0 },
        gps: { synced: 0, failed: 0 },
        rounds: { synced: 0, failed: 0 }
      };
    }

    // Sincronizar todo en paralelo
    const [attendanceResult, gpsResult, roundsResult] = await Promise.all([
      syncPendingMarks(),
      syncPendingGPS(),
      syncPendingRounds()
    ]);

    const totalSynced = 
      (attendanceResult.synced || 0) + 
      (gpsResult.synced || 0) + 
      (roundsResult.synced || 0);
    
    const totalFailed = 
      (attendanceResult.failed || 0) + 
      (gpsResult.failed || 0) + 
      (roundsResult.failed || 0);

    console.log('========== SINCRONIZACIÓN COMPLETADA ==========');
    console.log('Total sincronizado:', totalSynced);
    console.log('Total pendiente:', totalFailed);

    return {
      success: totalSynced > 0 || totalFailed === 0,
      totalSynced,
      totalFailed,
      attendance: attendanceResult,
      gps: gpsResult,
      rounds: roundsResult,
      message: totalSynced > 0 
        ? `${totalSynced} item${totalSynced !== 1 ? 's' : ''} sincronizado${totalSynced !== 1 ? 's' : ''}`
        : 'No hay elementos pendientes'
    };

  } catch (error) {
    console.error('❌ Error en sincronización completa:', error);
    return {
      success: false,
      message: 'Error en sincronización',
      attendance: { synced: 0, failed: 0 },
      gps: { synced: 0, failed: 0 },
      rounds: { synced: 0, failed: 0 }
    };
  }
};

// ========================================
// UTILIDADES
// ========================================

export const getPendingCount = async () => {
  try {
    const pendingMarks = await getData(STORAGE_KEYS.PENDING_MARKS) || [];
    const pendingGPS = await getData(STORAGE_KEYS.PENDING_GPS) || [];
    const pendingCheckpoints = await getData(STORAGE_KEYS.PENDING_CHECKPOINTS) || [];
    
    return {
      attendance: pendingMarks.length,
      gps: pendingGPS.length,
      rounds: pendingCheckpoints.length,
      total: pendingMarks.length + pendingGPS.length + pendingCheckpoints.length
    };
  } catch (error) {
    console.error('Error obteniendo pendientes:', error);
    return { attendance: 0, gps: 0, rounds: 0, total: 0 };
  }
};

export const getSyncStats = async () => {
  try {
    const pendingMarks = await getData(STORAGE_KEYS.PENDING_MARKS) || [];
    const pendingGPS = await getData(STORAGE_KEYS.PENDING_GPS) || [];
    const lastSync = await getData(STORAGE_KEYS.LAST_SYNC);
    
    return {
      attendance: {
        total: pendingMarks.length,
        ready: pendingMarks.filter(shouldRetry).length,
        onHold: pendingMarks.filter(m => !shouldRetry(m)).length
      },
      gps: {
        total: pendingGPS.length,
        ready: pendingGPS.filter(shouldRetry).length,
        onHold: pendingGPS.filter(p => !shouldRetry(p)).length
      },
      lastSync: lastSync
    };
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    return null;
  }
};

export const cleanOldPendingData = async () => {
  try {
    const cutoffDate = new Date(Date.now() - SYNC_CONFIG.MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
    
    // Limpiar Attendance
    const pendingMarks = await getData(STORAGE_KEYS.PENDING_MARKS) || [];
    const validMarks = pendingMarks.filter(mark => {
      const markDate = new Date(mark.queued_at || mark.timestamp);
      const retryCount = mark.retry_count || 0;
      return markDate > cutoffDate && retryCount < SYNC_CONFIG.MAX_RETRIES;
    });
    
    // Limpiar GPS
    const pendingGPS = await getData(STORAGE_KEYS.PENDING_GPS) || [];
    const validGPS = pendingGPS.filter(position => {
      const posDate = new Date(position.queued_at || position.timestamp);
      const retryCount = position.retry_count || 0;
      return posDate > cutoffDate && retryCount < SYNC_CONFIG.MAX_RETRIES;
    });
    
    await saveData(STORAGE_KEYS.PENDING_MARKS, validMarks);
    await saveData(STORAGE_KEYS.PENDING_GPS, validGPS);
    
    const cleaned = (pendingMarks.length - validMarks.length) + (pendingGPS.length - validGPS.length);
    
    if (cleaned > 0) {
      console.log(`🧹 Limpiados ${cleaned} elementos antiguos`);
    }
    
    return cleaned;
  } catch (error) {
    console.error('Error limpiando datos antiguos:', error);
    return 0;
  }
};
