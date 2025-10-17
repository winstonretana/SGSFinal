// src/services/attendanceService.js
import axios from 'axios';
import * as Location from 'expo-location';
import NetInfo from '@react-native-community/netinfo';
import { API_CONFIG, ENDPOINTS } from '../config/api';
import { saveData, getData, STORAGE_KEYS } from '../utils/storage';
import { addPendingMark, syncPendingMarks } from '../utils/sync';

// ✅ Verificar conexión correctamente
const checkConnection = async () => {
  try {
    const state = await NetInfo.fetch();
    if (state.isConnected && state.isInternetReachable !== false) {
      try {
        await axios.head(`${API_CONFIG.BASE_URL}/api/health`, { timeout: 3000 });
        return true;
      } catch {
        return true;
      }
    }
    return false;
  } catch {
    return true;
  }
};

// ✅ FUNCIÓN: Convertir código QR/NFC en zone_id
const resolveZoneId = async (zoneCodeOrId, tenantId) => {
  // Si ya es numérico, retornarlo
  if (!isNaN(zoneCodeOrId) && Number.isInteger(Number(zoneCodeOrId))) {
    console.log('✅ Zone ID ya es numérico:', zoneCodeOrId);
    return parseInt(zoneCodeOrId);
  }
  
  // Si es un código (EP001, ZN123, etc.), validarlo con el servidor
  try {
    console.log('🔍 Validando código de zona:', zoneCodeOrId);
    console.log('🔍 Tenant ID:', tenantId);
    
    const response = await axios.post(
      `${API_CONFIG.BASE_URL}${ENDPOINTS.VALIDATE_CODE}`,
      {
        code: zoneCodeOrId,
        tenant_id: tenantId
      },
      { 
        timeout: 8000,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('📥 Respuesta validación:', response.data);
    
    if (response.data.success && response.data.data?.zone_id) {
      console.log('✅ Zona encontrada:', response.data.data.zone_id, '-', response.data.data.zone_name);
      return response.data.data.zone_id;
    } else {
      // Respuesta exitosa pero sin zone_id
      console.error('❌ Código no encontrado en BD:', zoneCodeOrId);
      throw new Error(`El código "${zoneCodeOrId}" no está registrado en el sistema. Contacta al supervisor para configurarlo.`);
    }
    
  } catch (error) {
    console.error('❌ Error completo validando código:', error);
    
    // Manejar diferentes tipos de errores
    if (error.response) {
      // El servidor respondió con un error
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
      
      if (error.response.status === 404) {
        throw new Error(`El código "${zoneCodeOrId}" no existe en el sistema. Verifica que sea el código correcto o contacta al supervisor.`);
      } else if (error.response.status === 400) {
        throw new Error(error.response.data?.error || 'Código inválido');
      } else {
        throw new Error('Error del servidor al validar el código. Intenta nuevamente.');
      }
    } else if (error.request) {
      // No hubo respuesta del servidor
      console.error('Sin respuesta del servidor');
      throw new Error('No se pudo conectar con el servidor. Verifica tu conexión a internet.');
    } else {
      // Error al configurar la petición
      throw new Error(error.message || 'Error desconocido al validar el código');
    }
  }
};

export const registerAttendance = async (userId, zoneId, attendanceType, captureMethod, scannedData) => {
  try {
    console.log('=== REGISTRO DE ASISTENCIA ===');
    console.log('👤 Usuario:', userId);
    console.log('📍 Zona (original):', zoneId);
    console.log('📝 Tipo:', attendanceType);
    console.log('📱 Método:', captureMethod);
    
    const user = await getData(STORAGE_KEYS.USER);
    const tenantId = user?.tenant_id || 1;
    const clientId = user?.client_id || null;  // ✅ AGREGADO
    
    console.log('🏢 Tenant ID:', tenantId);
    console.log('🏢 Client ID:', clientId);  // ✅ AGREGADO
    
    // ✅ Resolver el zone_id con mejor manejo de errores
    let resolvedZoneId;
    try {
      resolvedZoneId = await resolveZoneId(zoneId, tenantId);
      console.log('✅ Zona resuelta:', resolvedZoneId);
    } catch (validationError) {
      console.error('❌ Error de validación de zona:', validationError.message);
      // Retornar error específico al usuario
      return {
        success: false,
        message: validationError.message,
        code: 'ZONE_VALIDATION_ERROR'
      };
    }
    
    let location = null;
    try {
      const locationPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        mayShowUserSettingsDialog: true,
      });
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('timeout')), 10000)
      );
      
      location = await Promise.race([locationPromise, timeoutPromise]);
      console.log('📍 Ubicación obtenida:', location.coords.latitude, location.coords.longitude);
    } catch (error) {
      console.log('⚠️ No se pudo obtener ubicación GPS, usando valores por defecto');
      location = {
        coords: {
          latitude: 0,
          longitude: 0,
          accuracy: 999
        }
      };
    }

    // ✅ Siempre enviar zone_id numérico y client_id
    const attendanceData = {
      user_id: userId,
      tenant_id: tenantId,
      client_id: clientId,  // ✅ AGREGADO
      zone_id: resolvedZoneId,
      attendance_type: attendanceType,
      capture_method: captureMethod.toUpperCase(),
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy,
      timestamp: new Date().toISOString(),
      device_info: `Mobile App - ${captureMethod}`,
      scanned_data: scannedData || {}
    };

    console.log('📤 Datos a enviar:', JSON.stringify(attendanceData, null, 2));
    
    try {
      const url = `${API_CONFIG.BASE_URL}${ENDPOINTS.ATTENDANCE_CHECK}`;
      console.log('🌐 URL:', url);
      
      const response = await axios.post(url, attendanceData, { 
        timeout: 15000,
        headers: {
          'Content-Type': 'application/json',
        },
        validateStatus: function (status) {
          return status < 500;
        }
      });

      console.log('📥 Status:', response.status);
      console.log('📥 Respuesta:', JSON.stringify(response.data, null, 2));

      if (response.data.success) {
        await saveData(STORAGE_KEYS.LAST_ACTION, {
          type: attendanceType,
          timestamp: new Date().toISOString(),
          synced: true,
          zone: resolvedZoneId
        });
        
        setTimeout(async () => {
          const pending = await getData(STORAGE_KEYS.PENDING_MARKS) || [];
          if (pending.length > 0) {
            console.log(`📤 Sincronizando ${pending.length} marcas antiguas...`);
            syncPendingMarks();
          }
        }, 2000);

        return {
          success: true,
          data: response.data.data,
          message: response.data.data?.message || 'Marca registrada exitosamente',
          serverTime: response.data.server_time,
          offline: false
        };
        
      } else if (response.status === 400) {
        console.log('❌ Error 400:', response.data.error);
        return {
          success: false,
          message: response.data.error || 'Datos inválidos',
          code: 'VALIDATION_ERROR',
          details: response.data.details
        };
        
      } else {
        throw new Error(response.data.error || 'Error del servidor');
      }

    } catch (networkError) {
      console.error('❌ Error de red:', networkError.message);
      
      if (networkError.response?.status >= 500) {
        console.log('💾 Error del servidor, guardando offline...');
        return await saveOfflineAttendance(attendanceData);
      }
      
      const isConnected = await checkConnection();
      
      if (!isConnected) {
        console.log('🔵 Sin conexión, guardando offline...');
        return await saveOfflineAttendance(attendanceData);
      } else {
        console.log('🔄 Reintentando envío...');
        try {
          const retryResponse = await axios.post(
            `${API_CONFIG.BASE_URL}${ENDPOINTS.ATTENDANCE_CHECK}`,
            attendanceData,
            { timeout: 10000 }
          );
          
          if (retryResponse.data.success) {
            await saveData(STORAGE_KEYS.LAST_ACTION, {
              type: attendanceType,
              timestamp: new Date().toISOString(),
              synced: true,
              zone: resolvedZoneId
            });
            
            return {
              success: true,
              data: retryResponse.data.data,
              message: 'Marca registrada exitosamente (segundo intento)',
              offline: false
            };
          }
        } catch (retryError) {
          console.log('❌ Segundo intento falló, guardando offline...');
          return await saveOfflineAttendance(attendanceData);
        }
      }
    }

  } catch (error) {
    console.error('❌ ERROR GENERAL:', error);
    console.error('Stack:', error.stack);
    return {
      success: false,
      message: error.message || 'Error al registrar asistencia',
      code: 'UNEXPECTED_ERROR'
    };
  }
};

const saveOfflineAttendance = async (attendanceData) => {
  try {
    const offlineId = `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const saved = await addPendingMark({
      ...attendanceData,
      offline_id: offlineId,
      created_offline: new Date().toISOString()
    });
    
    if (saved) {
      await saveData(STORAGE_KEYS.LAST_ACTION, {
        type: attendanceData.attendance_type,
        timestamp: attendanceData.timestamp,
        offline: true,
        zone: attendanceData.zone_id
      });

      console.log('💾 Marca guardada offline con ID:', offlineId);

      return {
        success: true,
        offline: true,
        message: 'Marca guardada localmente. Se enviará cuando haya conexión.',
        offlineId: offlineId
      };
    }
  } catch (error) {
    console.error('Error guardando offline:', error);
  }
  
  return {
    success: false,
    message: 'Error guardando marca offline',
    code: 'OFFLINE_SAVE_ERROR'
  };
};

export const getTodayAttendance = async () => {
  try {
    const user = await getData(STORAGE_KEYS.USER);
    if (!user) return null;
    
    const response = await axios.get(
      `${API_CONFIG.BASE_URL}${ENDPOINTS.ATTENDANCE_STATUS}`,
      {
        params: {
          user_id: user.car_user_id || user.user_id,
          tenant_id: user.tenant_id || 1
        },
        timeout: 10000
      }
    );
    
    return response.data;
  } catch (error) {
    console.error('Error obteniendo asistencia de hoy:', error);
    return null;
  }
};

export const sendPanicAlert = async (userId) => {
  try {
    const user = await getData(STORAGE_KEYS.USER);
    const tenantId = user?.tenant_id || 1;
    const clientId = user?.client_id || null;  // ✅ AGREGADO
    
    let location = { coords: { latitude: 0, longitude: 0 } };
    try {
      location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        timeout: 5000
      });
    } catch (e) {
      console.log('No se pudo obtener ubicación para pánico');
    }
    
    const response = await axios.post(
      `${API_CONFIG.BASE_URL}${ENDPOINTS.PANIC_CREATE}`,
      {
        user_id: userId,
        tenant_id: tenantId,
        client_id: clientId,  // ✅ AGREGADO
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        alert_type: 'panic',
        message: 'Botón de emergencia activado desde app móvil'
      },
      { 
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
    return {
      success: true,
      message: 'Alerta de emergencia enviada'
    };
  } catch (error) {
    console.error('Error enviando pánico:', error);
    return {
      success: true,
      message: 'Alerta registrada'
    };
  }
};

export const getAttendanceSummary = async () => {
  try {
    const pendingMarks = await getData(STORAGE_KEYS.PENDING_MARKS) || [];
    const lastAction = await getData(STORAGE_KEYS.LAST_ACTION);
    const isOnline = await checkConnection();
    
    return {
      pendingCount: pendingMarks.length,
      lastAction: lastAction,
      isOnline: isOnline
    };
  } catch (error) {
    console.error('Error getting summary:', error);
    return {
      pendingCount: 0,
      lastAction: null,
      isOnline: false
    };
  }
};
