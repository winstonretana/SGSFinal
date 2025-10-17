// src/services/authService.js
import axios from 'axios';
import { API_CONFIG, ENDPOINTS } from '../config/api';
import { saveData, removeData, STORAGE_KEYS } from '../utils/storage';

/**
 * Login del usuario con validación de módulos de acceso
 */
export const login = async (identification, pin) => {
  try {
    console.log('========== LOGIN DEBUG START ==========');
    console.log('🌐 URL:', `${API_CONFIG.BASE_URL}${ENDPOINTS.LOGIN}`);
    console.log('👤 Identification:', identification);
    console.log('🔐 PIN:', pin);
    console.log('📏 PIN length:', pin ? pin.length : 0);
    console.log('🔢 PIN type:', typeof pin);
    
    const payload = {
      identification: identification,
      pin: pin
    };
    
    console.log('📦 Payload:', JSON.stringify(payload, null, 2));
    console.log('⏱️ Timeout:', API_CONFIG.TIMEOUT);
    
    const response = await axios.post(
      `${API_CONFIG.BASE_URL}${ENDPOINTS.LOGIN}`,
      payload,
      { 
        timeout: API_CONFIG.TIMEOUT,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );

    console.log('✅ Response status:', response.status);
    console.log('✅ Response headers:', JSON.stringify(response.headers, null, 2));
    console.log('✅ Response data:', JSON.stringify(response.data, null, 2));

    if (response.data.success) {
      const userData = response.data.data;
      
      console.log('👤 User data received:', JSON.stringify(userData, null, 2));
      
      // ✅ VALIDAR MÓDULOS DE ACCESO
      const accessModules = validateUserAccess(userData);
      
      console.log('🔑 Access modules:', JSON.stringify(accessModules, null, 2));
      
      // Validar que el usuario tenga al menos un módulo
      if (!accessModules.hasAnyAccess) {
        console.warn('⚠️ User has no access modules');
        return {
          success: false,
          message: 'Tu cuenta no tiene módulos asignados. Contacta al administrador.'
        };
      }
      
      // Agregar módulos al userData
      const enhancedUserData = {
        ...userData,
        access: accessModules
      };
      
      console.log('💾 Saving enhanced user data...');
      await saveData(STORAGE_KEYS.USER, enhancedUserData);
      console.log('✅ User data saved successfully');
      
      // ✅ CARGAR ZONAS ASIGNADAS AL USUARIO
      if (accessModules.hasAnyAccess) {
        console.log('🗺️ Loading user zones...');
        console.log('   - Tenant ID:', userData.tenant_id);
        console.log('   - Client ID:', userData.client_id);
        console.log('   - User ID:', userData.car_user_id || userData.user_id);
        
        await loadZonesCache(
          userData.tenant_id,
          userData.client_id,
          userData.car_user_id || userData.user_id
        );
      }
      
      console.log('========== LOGIN DEBUG END (SUCCESS) ==========');
      
      return {
        success: true,
        user: enhancedUserData,
        access: accessModules,
        message: accessModules.getWelcomeMessage()
      };
    } else {
      console.error('❌ Login failed - Server returned success:false');
      console.error('Error message:', response.data.error);
      return {
        success: false,
        message: response.data.error || 'Error en el login'
      };
    }
  } catch (error) {
    console.error('========== LOGIN DEBUG END (ERROR) ==========');
    console.error('❌ Login error:', error.message);
    console.error('❌ Error name:', error.name);
    console.error('❌ Error code:', error.code);
    
    if (error.response) {
      console.error('📡 Response status:', error.response.status);
      console.error('📡 Response data:', JSON.stringify(error.response.data, null, 2));
      console.error('📡 Response headers:', JSON.stringify(error.response.headers, null, 2));
    } else if (error.request) {
      console.error('📡 No response received');
      console.error('Request:', error.request);
    } else {
      console.error('❌ Error setting up request:', error.message);
    }
    
    return {
      success: false,
      message: error.response?.data?.error || 'Error de conexión'
    };
  }
};

/**
 * Validar qué módulos tiene acceso el usuario
 */
export const validateUserAccess = (userData) => {
  const hasAttendance = userData.has_attendance_access === 1 || 
                       userData.has_attendance_access === true ||
                       userData.has_attendance_access === '1';
                       
  const hasRounds = userData.has_rounds_access === 1 || 
                   userData.has_rounds_access === true ||
                   userData.has_rounds_access === '1';
                   
  const hasSentinel = userData.has_sentinel_access === 1 || 
                     userData.has_sentinel_access === true ||
                     userData.has_sentinel_access === '1';
  
  const isSupervisor = userData.is_supervisor === 1 || 
                      userData.is_supervisor === true ||
                      userData.is_supervisor === '1';
  
  const modules = [];
  if (hasAttendance) modules.push('attendance');
  if (hasRounds) modules.push('rounds');
  if (hasSentinel) modules.push('sentinel');
  
  return {
    hasAttendance,
    hasRounds,
    hasSentinel,
    isSupervisor,
    hasAll: hasAttendance && hasRounds && hasSentinel,
    hasAttendanceAndRounds: hasAttendance && hasRounds && !hasSentinel,
    hasAttendanceAndSentinel: hasAttendance && hasSentinel && !hasRounds,
    hasRoundsAndSentinel: hasRounds && hasSentinel && !hasAttendance,
    hasOnlyAttendance: hasAttendance && !hasRounds && !hasSentinel,
    hasOnlyRounds: hasRounds && !hasAttendance && !hasSentinel,
    hasOnlySentinel: hasSentinel && !hasAttendance && !hasRounds,
    hasAnyAccess: hasAttendance || hasRounds || hasSentinel,
    modules: modules,
    modulesCount: modules.length,
    
    getWelcomeMessage() {
      if (this.hasAll) return 'Acceso completo: Asistencia, Rondas y Tracking';
      if (this.hasAttendanceAndRounds) return 'Acceso: Asistencia y Rondas';
      if (this.hasAttendanceAndSentinel) return 'Acceso: Asistencia y Tracking';
      if (this.hasRoundsAndSentinel) return 'Acceso: Rondas y Tracking';
      if (this.hasOnlyAttendance) return 'Acceso: Solo Asistencia';
      if (this.hasOnlyRounds) return 'Acceso: Solo Rondas';
      if (this.hasOnlySentinel) return 'Acceso: Solo Tracking';
      return 'Sin módulos asignados';
    },
    
    getAvailableFeatures() {
      const features = [];
      
      if (this.hasAttendance) {
        features.push({
          id: 'scanner',
          name: 'Escanear',
          icon: 'qrcode-scan',
          route: 'Scanner',
          color: '#3B82F6',
          description: 'Marcar entrada/salida/break'
        });
      }
      
      if (this.hasRounds) {
        features.push({
          id: 'rounds',
          name: 'Rondas',
          icon: 'map-marker-path',
          route: 'Rounds',
          color: '#8B5CF6',
          description: 'Ver y completar rondas asignadas'
        });
      }
      
      if (this.hasOnlySentinel) {
        features.push({
          id: 'sentinel',
          name: 'Tracking',
          icon: 'crosshairs-gps',
          route: 'Sentinel',
          color: '#10B981',
          description: 'Tracking GPS en tiempo real'
        });
      }
      
      if (this.hasAnyAccess) {
        features.push({
          id: 'history',
          name: 'Historial',
          icon: 'history',
          route: 'History',
          color: '#64748B',
          description: 'Ver marcas del día'
        });
      }
      
      if (this.isSupervisor && this.hasAttendance) {
        features.push({
          id: 'admin_nfc',
          name: 'Admin NFC',
          icon: 'nfc-variant',
          route: 'AdminNFC',
          color: '#F59E0B',
          description: 'Configurar tags NFC'
        });
      }
      
      return features;
    },
    
    shouldStartGPSTracking() {
      return this.hasSentinel;
    },
    
    getModuleColor() {
      if (this.hasAll) return '#10B981';
      if (this.modulesCount === 2) return '#3B82F6';
      if (this.modulesCount === 1) return '#F59E0B';
      return '#64748B';
    }
  };
};

/**
 * ✅ CORREGIDO: Cargar zonas ASIGNADAS AL USUARIO
 */
export const loadZonesCache = async (tenantId, clientId = null, userId = null) => {
  try {
    console.log('========== LOAD ZONES DEBUG START ==========');
    
    if (!tenantId) {
      console.error('❌ tenantId es requerido');
      return { success: false, message: 'Tenant ID requerido' };
    }
    
    if (!userId) {
      console.error('❌ userId es requerido');
      return { success: false, message: 'User ID requerido' };
    }
    
    console.log('📄 Loading zones for:');
    console.log('   - User ID:', userId);
    console.log('   - Tenant ID:', tenantId);
    console.log('   - Client ID:', clientId || 'N/A');
    
    const params = { 
      tenant_id: tenantId,
      user_id: userId
    };
    
    if (clientId) params.client_id = clientId;
    
    const queryString = new URLSearchParams(params).toString();
    const url = `${API_CONFIG.BASE_URL}${ENDPOINTS.USER_ZONES}?${queryString}`;
    
    console.log('📡 Zones URL:', url);
    
    const response = await axios.get(url, { timeout: 10000 });
    
    console.log('✅ Zones response status:', response.status);
    console.log('✅ Zones response data:', JSON.stringify(response.data, null, 2));
    
    if (response.data.success && Array.isArray(response.data.data)) {
      const zones = response.data.data;
      console.log(`✅ ${zones.length} zones loaded`);
      
      // Separar zonas por tipo
      const zonesByType = {
        attendance: zones.filter(z => z.is_attendance_zone),
        rounds: zones.filter(z => z.is_rounds_zone),
        sentinel: zones.filter(z => z.is_sentinel_zone),
        all: zones
      };
      
      // Guardar en cache
      await saveData(STORAGE_KEYS.ZONES, zonesByType);
      await saveData(STORAGE_KEYS.ZONES_LAST_UPDATE, new Date().toISOString());
      
      // Log importante
      console.log('📊 Zones by type:', {
        attendance: zonesByType.attendance.length,
        rounds: zonesByType.rounds.length,
        sentinel: zonesByType.sentinel.length
      });
      
      // ✅ Log de zona Sentinel específica
      if (zonesByType.sentinel.length > 0) {
        const sentinelZone = zonesByType.sentinel[0];
        console.log('🎯 Sentinel zone assigned:', sentinelZone.zone_name, `(ID: ${sentinelZone.zone_id})`);
      } else {
        console.warn('⚠️ No sentinel zone assigned to user');
      }
      
      console.log('========== LOAD ZONES DEBUG END (SUCCESS) ==========');
      
      return { 
        success: true, 
        count: zones.length,
        byType: {
          attendance: zonesByType.attendance.length,
          rounds: zonesByType.rounds.length,
          sentinel: zonesByType.sentinel.length
        }
      };
    } else {
      console.warn('⚠️ Invalid zones response format');
      console.log('========== LOAD ZONES DEBUG END (INVALID) ==========');
      return { success: false, message: 'Formato de respuesta inválido' };
    }
  } catch (error) {
    console.error('========== LOAD ZONES DEBUG END (ERROR) ==========');
    console.error('❌ Error loading zones:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    return { success: false, message: error.message };
  }
};

/**
 * Cerrar sesión
 */
export const logout = async () => {
  try {
    console.log('🚪 Logging out...');
    await removeData(STORAGE_KEYS.USER);
    await removeData(STORAGE_KEYS.LAST_ACTION);
    await removeData(STORAGE_KEYS.ZONES);
    await removeData(STORAGE_KEYS.ZONES_LAST_UPDATE);
    await removeData(STORAGE_KEYS.PENDING_MARKS);
    await removeData(STORAGE_KEYS.PENDING_GPS);
    await removeData(STORAGE_KEYS.LAST_GPS_POSITION);
    await removeData(STORAGE_KEYS.GPS_TRACKING_ACTIVE);
    console.log('✅ Logout successful');
    return { success: true };
  } catch (error) {
    console.error('❌ Logout error:', error);
    return { success: false };
  }
};

/**
 * Validar PIN del usuario
 */
export const validatePin = async (userId, pin, tenantId) => {
  try {
    console.log('🔐 Validating PIN for user:', userId);
    
    if (!tenantId) {
      console.error('❌ tenantId is required to validate PIN');
      return false;
    }
    
    const response = await axios.post(
      `${API_CONFIG.BASE_URL}${ENDPOINTS.VALIDATE_PIN}`,
      {
        user_id: userId,
        pin: pin,
        tenant_id: tenantId
      },
      { timeout: 5000 }
    );
    
    console.log('✅ PIN validation result:', response.data.is_valid);
    return response.data.is_valid || false;
  } catch (error) {
    console.error('❌ Error validating PIN:', error);
    return false;
  }
};
