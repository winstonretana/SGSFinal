import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';

const GEOFENCE_TASK = 'ZONE_GEOFENCE_TASK';

TaskManager.defineTask(GEOFENCE_TASK, async ({ data: { eventType, region }, error }) => {
  if (error) {
    console.error('Geofence error:', error);
    return;
  }

  try {
    if (eventType === Location.GeofencingEventType.Enter) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Entraste a zona de trabajo',
          body: `Zona: ${region.identifier}. Recuerda marcar tu entrada.`,
          sound: 'default',
          priority: 'high'
        },
        trigger: null
      });
    } else if (eventType === Location.GeofencingEventType.Exit) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Saliste de zona de trabajo',
          body: `Zona: ${region.identifier}. Recuerda marcar tu salida.`,
          sound: 'default',
          priority: 'high'
        },
        trigger: null
      });
    }
  } catch (notifError) {
    console.error('Notification error:', notifError);
  }
});

export const initGeofencing = async (zones) => {
  try {
    console.log('Iniciando geofencing con', zones.length, 'zonas');
    
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      console.log('Permiso foreground denegado');
      return { success: false, error: 'Permiso de ubicación denegado' };
    }

    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    if (backgroundStatus !== 'granted') {
      console.log('Permiso background denegado');
      return { success: false, error: 'Permiso de ubicación en segundo plano denegado' };
    }

    await Notifications.requestPermissionsAsync();

    const geofences = zones.map(zone => ({
      identifier: zone.zone_code,
      latitude: parseFloat(zone.latitude),
      longitude: parseFloat(zone.longitude),
      radius: parseInt(zone.geocerca_radius),
      notifyOnEnter: true,
      notifyOnExit: true
    }));

    await Location.startGeofencingAsync(GEOFENCE_TASK, geofences);
    
    console.log('Geofencing iniciado exitosamente');
    return { success: true, count: geofences.length };
  } catch (error) {
    console.error('Error iniciando geofencing:', error);
    return { success: false, error: error.message };
  }
};

export const stopGeofencing = async () => {
  try {
    await Location.stopGeofencingAsync(GEOFENCE_TASK);
    console.log('Geofencing detenido');
    return { success: true };
  } catch (error) {
    console.error('Error deteniendo geofencing:', error);
    return { success: false };
  }
};
