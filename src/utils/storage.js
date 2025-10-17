// src/utils/storage.js
import AsyncStorage from '@react-native-async-storage/async-storage';

// ========================================
// FUNCIONES DE ALMACENAMIENTO
// ========================================

// Guardar datos en el teléfono
export const saveData = async (key, value) => {
  try {
    const jsonValue = JSON.stringify(value);
    await AsyncStorage.setItem(key, jsonValue);
    return true;
  } catch (error) {
    console.error('Error guardando datos:', error);
    return false;
  }
};

// Leer datos del teléfono
export const getData = async (key) => {
  try {
    const jsonValue = await AsyncStorage.getItem(key);
    return jsonValue != null ? JSON.parse(jsonValue) : null;
  } catch (error) {
    console.error('Error leyendo datos:', error);
    return null;
  }
};

// Eliminar datos
export const removeData = async (key) => {
  try {
    await AsyncStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error('Error eliminando datos:', error);
    return false;
  }
};

// Limpiar todo el storage
export const clearAll = async () => {
  try {
    await AsyncStorage.clear();
    return true;
  } catch (error) {
    console.error('Error limpiando storage:', error);
    return false;
  }
};

// Obtener todas las claves
export const getAllKeys = async () => {
  try {
    return await AsyncStorage.getAllKeys();
  } catch (error) {
    console.error('Error obteniendo claves:', error);
    return [];
  }
};

// Obtener múltiples valores
export const getMultiple = async (keys) => {
  try {
    const values = await AsyncStorage.multiGet(keys);
    return values.reduce((acc, [key, value]) => {
      acc[key] = value ? JSON.parse(value) : null;
      return acc;
    }, {});
  } catch (error) {
    console.error('Error obteniendo múltiples valores:', error);
    return {};
  }
};

// Guardar múltiples valores
export const saveMultiple = async (keyValuePairs) => {
  try {
    const pairs = keyValuePairs.map(([key, value]) => [
      key,
      JSON.stringify(value)
    ]);
    await AsyncStorage.multiSet(pairs);
    return true;
  } catch (error) {
    console.error('Error guardando múltiples valores:', error);
    return false;
  }
};

// ========================================
// CLAVES DE ALMACENAMIENTO
// ========================================

export const STORAGE_KEYS = {
  // Autenticación y Usuario
  USER: 'user_data',
  TOKEN: 'auth_token',
  
  // Attendance (Asistencia)
  PENDING_MARKS: 'pending_marks',
  LAST_SYNC: 'last_sync',
  LAST_ACTION: 'last_action',
  
  // Zonas (Compartido)
  ZONES: 'zones_cache',
  ZONES_LAST_UPDATE: 'zones_last_update',
  
  // Sentinel (GPS Tracking)
  PENDING_GPS: 'pending_gps_positions',
  LAST_GPS_POSITION: 'last_gps_position',
  GPS_TRACKING_ACTIVE: 'gps_tracking_active',
  GPS_SETTINGS: 'gps_settings',
  
  // Rounds (Rondas)
  ROUNDS_ASSIGNMENTS: 'rounds_assignments',
  ACTIVE_ROUND: 'active_round',
  ROUND_CHECKPOINTS: 'round_checkpoints',
  PENDING_CHECKPOINTS: 'pending_checkpoints',
  
  // Modo Offline
  OFFLINE_MODE: 'offline_mode'
};

// ========================================
// UTILIDADES DE DEBUG
// ========================================

// Ver todo el contenido del storage (solo para desarrollo)
export const debugStorage = async () => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const data = await AsyncStorage.multiGet(keys);
    
    const formatted = data.reduce((acc, [key, value]) => {
      try {
        acc[key] = value ? JSON.parse(value) : null;
      } catch {
        acc[key] = value;
      }
      return acc;
    }, {});
    
    console.log('📦 Storage completo:', formatted);
    return formatted;
  } catch (error) {
    console.error('Error en debug storage:', error);
    return null;
  }
};

// Ver tamaño aproximado del storage
export const getStorageSize = async () => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const data = await AsyncStorage.multiGet(keys);
    
    let totalSize = 0;
    const sizes = {};
    
    data.forEach(([key, value]) => {
      const size = value ? new Blob([value]).size : 0;
      sizes[key] = size;
      totalSize += size;
    });
    
    console.log('📏 Tamaño del storage:', {
      total: `${(totalSize / 1024).toFixed(2)} KB`,
      byKey: Object.entries(sizes).map(([key, size]) => ({
        key,
        size: `${(size / 1024).toFixed(2)} KB`
      }))
    });
    
    return { total: totalSize, byKey: sizes };
  } catch (error) {
    console.error('Error calculando tamaño:', error);
    return null;
  }
};

// Limpiar solo datos de un módulo específico
export const clearModuleData = async (module) => {
  try {
    let keysToRemove = [];
    
    switch (module) {
      case 'attendance':
        keysToRemove = [
          STORAGE_KEYS.PENDING_MARKS,
          STORAGE_KEYS.LAST_ACTION,
          STORAGE_KEYS.LAST_SYNC
        ];
        break;
      case 'sentinel':
        keysToRemove = [
          STORAGE_KEYS.PENDING_GPS,
          STORAGE_KEYS.LAST_GPS_POSITION,
          STORAGE_KEYS.GPS_TRACKING_ACTIVE,
          STORAGE_KEYS.GPS_SETTINGS
        ];
        break;
      case 'rounds':
        keysToRemove = [
          STORAGE_KEYS.ROUNDS_ASSIGNMENTS,
          STORAGE_KEYS.ACTIVE_ROUND,
          STORAGE_KEYS.ROUND_CHECKPOINTS,
          STORAGE_KEYS.PENDING_CHECKPOINTS
        ];
        break;
      default:
        console.warn('Módulo desconocido:', module);
        return false;
    }
    
    await AsyncStorage.multiRemove(keysToRemove);
    console.log(`🧹 Datos de ${module} limpiados`);
    return true;
  } catch (error) {
    console.error(`Error limpiando datos de ${module}:`, error);
    return false;
  }
};

// Exportar datos para backup (JSON)
export const exportData = async () => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const data = await AsyncStorage.multiGet(keys);
    
    const exportData = data.reduce((acc, [key, value]) => {
      try {
        acc[key] = value ? JSON.parse(value) : null;
      } catch {
        acc[key] = value;
      }
      return acc;
    }, {});
    
    return {
      exportDate: new Date().toISOString(),
      appVersion: '1.2.1',
      data: exportData
    };
  } catch (error) {
    console.error('Error exportando datos:', error);
    return null;
  }
};

// Importar datos desde backup
export const importData = async (backupData) => {
  try {
    if (!backupData || !backupData.data) {
      throw new Error('Datos de backup inválidos');
    }
    
    const pairs = Object.entries(backupData.data).map(([key, value]) => [
      key,
      JSON.stringify(value)
    ]);
    
    await AsyncStorage.multiSet(pairs);
    console.log('✅ Datos importados exitosamente');
    return true;
  } catch (error) {
    console.error('Error importando datos:', error);
    return false;
  }
};
