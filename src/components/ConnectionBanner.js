// src/components/ConnectionBanner.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { subscribe, getConnectionStatus } from '../services/heartbeatService';

export default function ConnectionBanner() {
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [slideAnim] = useState(new Animated.Value(-100));
  const [syncedCount, setSyncedCount] = useState(0);

  useEffect(() => {
    // Estado inicial
    const status = getConnectionStatus();
    setIsOnline(status.isOnline);

    // Suscribirse a cambios
    const unsubscribe = subscribe((update) => {
      console.log('📡 Banner update:', update);
      
      switch (update.event) {
        case 'offline':
          setIsOnline(false);
          setIsSyncing(false);
          showBanner();
          break;
          
        case 'online':
          setIsOnline(true);
          setIsSyncing(false);
          showBanner();
          // Auto-ocultar después de 3 segundos
          setTimeout(hideBanner, 3000);
          break;
          
        case 'synced':
          setIsSyncing(false);
          if (update.data && update.data.totalSynced > 0) {
            setSyncedCount(update.data.totalSynced);
            showBanner();
            // Mostrar por 4 segundos
            setTimeout(hideBanner, 4000);
          }
          break;
          
        case 'gps_disabled':
          // Mostrar banner rojo de GPS desactivado
          showBanner();
          break;
          
        case 'gps_enabled':
          // GPS reactivado, ocultar después de 3s
          showBanner();
          setTimeout(hideBanner, 3000);
          break;
      }
    });

    return () => unsubscribe();
  }, []);

  const showBanner = () => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      friction: 8,
      tension: 40
    }).start();
  };

  const hideBanner = () => {
    Animated.timing(slideAnim, {
      toValue: -100,
      duration: 300,
      useNativeDriver: true
    }).start();
  };

  const getBannerStyle = () => {
    if (!isOnline) {
      return styles.bannerOffline;
    }
    if (syncedCount > 0) {
      return styles.bannerSynced;
    }
    return styles.bannerOnline;
  };

  const getBannerText = () => {
    if (!isOnline) {
      return '⚠️ Sin conexión - Guardando offline';
    }
    if (syncedCount > 0) {
      return `✅ ${syncedCount} item${syncedCount !== 1 ? 's' : ''} sincronizado${syncedCount !== 1 ? 's' : ''}`;
    }
    return '✅ Conectado';
  };

  const getIcon = () => {
    if (!isOnline) {
      return 'cloud-off';
    }
    if (syncedCount > 0) {
      return 'cloud-done';
    }
    return 'cloud-queue';
  };

  return (
    <Animated.View 
      style={[
        styles.banner, 
        getBannerStyle(),
        { transform: [{ translateY: slideAnim }] }
      ]}
    >
      <MaterialIcons name={getIcon()} size={20} color="#FFFFFF" />
      <Text style={styles.bannerText}>{getBannerText()}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    paddingTop: 48, // Para status bar
    zIndex: 9999,
    gap: 8
  },
  bannerOffline: {
    backgroundColor: '#EF4444',
  },
  bannerOnline: {
    backgroundColor: '#10B981',
  },
  bannerSynced: {
    backgroundColor: '#3B82F6',
  },
  bannerText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  }
});
