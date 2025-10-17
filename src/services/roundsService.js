// src/services/roundsService.js
import axios from 'axios';
import * as Location from 'expo-location';
import { API_CONFIG, ENDPOINTS } from '../config/api';
import { getData, saveData, STORAGE_KEYS } from '../utils/storage';

/**
 * Obtener mis asignaciones de rondas
 */
export const getMyAssignments = async (userId, tenantId) => {
  try {
    console.log('📍 GET MY ASSIGNMENTS - User:', userId, 'Tenant:', tenantId);
    
    // Obtener client_id del usuario guardado
    const user = await getData(STORAGE_KEYS.USER);
    const clientId = user?.client_id;
    
    if (!clientId) {
      console.error('❌ No client_id found');
      return {
        success: false,
        message: 'Error de sesión: client_id no encontrado'
      };
    }
    
    const url = `${API_CONFIG.BASE_URL}${ENDPOINTS.ROUNDS_ASSIGNMENTS}`;
    const params = {
      user_id: userId,
      tenant_id: tenantId,
      client_id: clientId
    };
    
    console.log('🌐 URL:', url);
    console.log('📦 Params:', params);
    
    const response = await axios.get(url, {
      params: params,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Response:', response.data);
    
    if (response.data.success) {
      return {
        success: true,
        data: response.data.data || [],
        count: response.data.count || 0
      };
    } else {
      return {
        success: false,
        message: response.data.error || 'Error al cargar rondas'
      };
    }
    
  } catch (error) {
    console.error('❌ Error in getMyAssignments:', error);
    console.error('Response:', error.response?.data);
    
    return {
      success: false,
      message: error.response?.data?.error || 'Error de conexión al cargar rondas'
    };
  }
};

/**
 * Iniciar una ronda
 */
export const startRound = async (assignmentId, userId, tenantId) => {
  try {
    console.log('🚀 START ROUND:', { assignmentId, userId, tenantId });
    
    const response = await axios.post(
      `${API_CONFIG.BASE_URL}${ENDPOINTS.ROUNDS_START}`,
      {
        assignment_id: assignmentId,
        user_id: userId,
        tenant_id: tenantId
      },
      { 
        timeout: 15000,
        headers: { 'Content-Type': 'application/json' }
      }
    );
    
    console.log('✅ Start round response:', response.data);
    
    if (response.data.success) {
      // Guardar ronda activa
      await saveData(STORAGE_KEYS.ACTIVE_ROUND, {
        assignment_id: assignmentId,
        started_at: new Date().toISOString()
      });
      
      return {
        success: true,
        data: response.data.data,
        message: 'Ronda iniciada exitosamente'
      };
    } else {
      return {
        success: false,
        message: response.data.error || 'Error al iniciar ronda'
      };
    }
    
  } catch (error) {
    console.error('❌ Error starting round:', error);
    return {
      success: false,
      message: error.response?.data?.error || 'Error al iniciar ronda'
    };
  }
};

/**
 * Obtener progreso de una ronda
 */
export const getRoundProgress = async (assignmentId, userId, tenantId) => {
  try {
    console.log('📊 GET ROUND PROGRESS:', { assignmentId, userId, tenantId });
    
    // ✅ CORREGIDO: Usar query params en lugar de path params
    const url = `${API_CONFIG.BASE_URL}${ENDPOINTS.ROUNDS_PROGRESS}`;
    
    const response = await axios.get(url, {
      params: {
        assignment_id: assignmentId,
        user_id: userId,
        tenant_id: tenantId
      },
      timeout: 15000
    });
    
    console.log('✅ Progress response:', response.data);
    
    if (response.data.success) {
      return {
        success: true,
        assignment: response.data.data.assignment,
        checkpoints: response.data.data.checkpoints || []
      };
    } else {
      return {
        success: false,
        message: response.data.error || 'Error al cargar progreso'
      };
    }
    
  } catch (error) {
    console.error('❌ Error getting progress:', error);
    return {
      success: false,
      message: 'Error al cargar progreso de la ronda'
    };
  }
};

/**
 * Completar un checkpoint
 */
export const completeCheckpoint = async (
  assignmentId,
  roadmapZoneId,
  userId,
  captureMethod,
  checklistResponses = null,
  notes = null,
  photoUrls = null,
  signatureUrl = null,
  tenantId = 1
) => {
  try {
    console.log('✅ COMPLETE CHECKPOINT:', {
      assignmentId,
      roadmapZoneId,
      userId
    });
    
    // Obtener ubicación
    let location;
    try {
      location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        timeout: 10000
      });
    } catch (locError) {
      console.error('❌ Location error:', locError);
      return {
        success: false,
        code: 'LOCATION_ERROR',
        message: 'No se pudo obtener tu ubicación GPS. Activa el GPS e intenta de nuevo.'
      };
    }
    
    const checkpointData = {
      assignment_id: assignmentId,
      roadmap_zone_id: roadmapZoneId,
      user_id: userId,
      tenant_id: tenantId,
      capture_method: captureMethod,
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      checklist_responses: checklistResponses,
      notes: notes,
      photo_urls: photoUrls,
      signature_url: signatureUrl,
      device_info: 'Mobile App',
      app_version: '1.2.1'
    };
    
    console.log('📤 Checkpoint data:', checkpointData);
    
    const response = await axios.post(
      `${API_CONFIG.BASE_URL}${ENDPOINTS.ROUNDS_CHECKPOINT_COMPLETE}`,
      checkpointData,
      { 
        timeout: 15000,
        headers: { 'Content-Type': 'application/json' }
      }
    );
    
    console.log('✅ Complete checkpoint response:', response.data);
    
    if (response.data.success) {
      return {
        success: true,
        data: response.data.data,
        message: 'Checkpoint completado exitosamente'
      };
    } else {
      // Manejar errores de validación de geocerca
      if (response.data.data?.IsValid === false || response.data.data?.IsValid === 0) {
        return {
          success: false,
          code: 'GEOFENCE_ERROR',
          message: `Estás a ${response.data.data.Distance || '?'} metros del checkpoint. Debes estar dentro del área permitida.`,
          distance: response.data.data.Distance
        };
      }
      
      return {
        success: false,
        message: response.data.message || 'Error al completar checkpoint'
      };
    }
    
  } catch (error) {
    console.error('❌ Error completing checkpoint:', error);
    console.error('Response:', error.response?.data);
    
    return {
      success: false,
      message: error.response?.data?.error || 'Error al completar checkpoint'
    };
  }
};

/**
 * Saltar un checkpoint
 */
export const skipCheckpoint = async (
  assignmentId,
  roadmapZoneId,
  userId,
  skipReason,
  skipCategory = 'other',
  skipPhotoUrl = null,
  tenantId = 1
) => {
  try {
    console.log('⏭️ SKIP CHECKPOINT:', {
      assignmentId,
      roadmapZoneId,
      userId,
      reason: skipReason
    });
    
    // Obtener ubicación
    let location;
    try {
      location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        timeout: 5000
      });
    } catch (locError) {
      location = {
        coords: { latitude: 0, longitude: 0 }
      };
    }
    
    const skipData = {
      assignment_id: assignmentId,
      roadmap_zone_id: roadmapZoneId,
      user_id: userId,
      tenant_id: tenantId,
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      skip_reason: skipReason,
      skip_category: skipCategory,
      skip_photo_url: skipPhotoUrl,
      capture_method: 'gps',
      device_info: 'Mobile App'
    };
    
    const response = await axios.post(
      `${API_CONFIG.BASE_URL}${ENDPOINTS.ROUNDS_CHECKPOINT_SKIP}`,
      skipData,
      { 
        timeout: 15000,
        headers: { 'Content-Type': 'application/json' }
      }
    );
    
    if (response.data.success) {
      return {
        success: true,
        data: response.data.data,
        message: 'Checkpoint saltado, pendiente de aprobación'
      };
    } else {
      return {
        success: false,
        message: response.data.message || 'Error al saltar checkpoint'
      };
    }
    
  } catch (error) {
    console.error('❌ Error skipping checkpoint:', error);
    return {
      success: false,
      message: error.response?.data?.error || 'Error al saltar checkpoint'
    };
  }
};

/**
 * Completar/Finalizar una ronda
 */
export const completeRound = async (assignmentId, userId, tenantId) => {
  try {
    console.log('🏁 COMPLETE ROUND:', { assignmentId, userId, tenantId });
    
    const response = await axios.post(
      `${API_CONFIG.BASE_URL}${ENDPOINTS.ROUNDS_COMPLETE}`,
      {
        assignment_id: assignmentId,
        user_id: userId,
        tenant_id: tenantId
      },
      { 
        timeout: 15000,
        headers: { 'Content-Type': 'application/json' }
      }
    );
    
    if (response.data.success) {
      // Limpiar ronda activa
      await saveData(STORAGE_KEYS.ACTIVE_ROUND, null);
      
      return {
        success: true,
        data: response.data.data,
        message: 'Ronda completada exitosamente'
      };
    } else {
      return {
        success: false,
        message: response.data.error || 'Error al completar ronda'
      };
    }
    
  } catch (error) {
    console.error('❌ Error completing round:', error);
    return {
      success: false,
      message: error.response?.data?.error || 'No se pudo completar la ronda'
    };
  }
};

/**
 * Obtener ronda activa
 */
export const getActiveRound = async () => {
  try {
    const activeRound = await getData(STORAGE_KEYS.ACTIVE_ROUND);
    return activeRound;
  } catch (error) {
    return null;
  }
};

/**
 * Calcular distancia entre dos puntos (Haversine)
 */
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Radio de la Tierra en metros
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Retorna distancia en metros
};
