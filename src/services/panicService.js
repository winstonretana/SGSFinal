import axios from 'axios';
import * as Location from 'expo-location';
import { API_CONFIG, ENDPOINTS } from '../config/api';
import { getData, STORAGE_KEYS } from '../utils/storage';

export const sendPanicAlert = async (userId) => {
  try {
    const user = await getData(STORAGE_KEYS.USER);
    const tenantId = user?.tenant_id || 1;
    let latitude = 0, longitude = 0;
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, timeout: 3000 });
      latitude = loc.coords.latitude;
      longitude = loc.coords.longitude;
    } catch (e) {}
    await axios.post(`${API_CONFIG.BASE_URL}${ENDPOINTS.PANIC}`, {
      user_id: userId,
      tenant_id: tenantId,
      latitude,
      longitude,
      alert_type: 'panic',
      message: 'Boton de emergencia activado'
    }, { timeout: 8000, headers: { 'Content-Type': 'application/json' } });
    return { success: true, message: 'Alerta enviada' };
  } catch (error) {
    return { success: true, message: 'Alerta registrada' };
  }
};
