import { getData, STORAGE_KEYS } from './storage';

// VALIDAR si puede marcar según las reglas de negocio
export const canMakeAttendance = async (newType) => {
  try {
    const lastAction = await getData(STORAGE_KEYS.LAST_ACTION);
    
    // Si no hay acción previa, permitir solo CHECK_IN
    if (!lastAction) {
      if (newType !== 'check_in') {
        return {
          valid: false,
          message: 'Debes marcar ENTRADA primero'
        };
      }
      return { valid: true };
    }

    const now = new Date();
    const lastTime = new Date(lastAction.timestamp);
    const minutesDiff = (now - lastTime) / (1000 * 60);

    // REGLA: Mínimo 2 minutos entre marcas
    if (minutesDiff < 2) {
      return {
        valid: false,
        message: `Espera ${Math.ceil(2 - minutesDiff)} minutos antes de marcar nuevamente`
      };
    }

    // REGLA: No puede marcar entrada 2 veces seguidas
    if (lastAction.type === 'check_in' && newType === 'check_in') {
      return {
        valid: false,
        message: 'Ya marcaste ENTRADA. Debes marcar SALIDA o BREAK'
      };
    }

    // REGLA: No puede marcar salida sin entrada previa
    if (lastAction.type === 'check_out' && newType === 'check_out') {
      return {
        valid: false,
        message: 'Ya marcaste SALIDA'
      };
    }

    // REGLA: Debe marcar entrada antes de salida
    if (!lastAction.type.includes('check_in') && newType === 'check_out') {
      return {
        valid: false,
        message: 'Debes marcar ENTRADA antes de SALIDA'
      };
    }

    return { valid: true };

  } catch (error) {
    console.error('Error validando:', error);
    return {
      valid: false,
      message: 'Error al validar. Intenta de nuevo.'
    };
  }
};

// CALCULAR distancia entre dos coordenadas (en metros)
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Radio de la Tierra en metros
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distancia en metros
};
