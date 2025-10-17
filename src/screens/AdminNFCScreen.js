// src/screens/AdminNFCScreen.js - VERSIÓN FINAL: Attendance + Rounds
import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  SafeAreaView, StatusBar, ScrollView, ActivityIndicator,
  Platform, Vibration
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import NfcManager, { NfcTech, Ndef } from 'react-native-nfc-manager';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import axios from 'axios';
import { API_CONFIG, ENDPOINTS } from '../config/api';

export default function AdminNFCScreen({ route, navigation }) {
  const { user } = route.params || {};
  const [zones, setZones] = useState([]);
  const [selectedZone, setSelectedZone] = useState(null);
  const [nfcData, setNfcData] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingZones, setLoadingZones] = useState(true);
  const [nfcSupported, setNfcSupported] = useState(true);
  const [nfcEnabled, setNfcEnabled] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    checkPermissions();
    loadZones();
    initializeNFC();
    
    return () => {
      cleanupNFC();
    };
  }, []);

  const checkPermissions = () => {
    if (!user?.is_supervisor) {
      Alert.alert(
        '⛔ Acceso Denegado',
        'Solo los supervisores pueden actualizar NFCs',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    }
  };

  const cleanupNFC = async () => {
    try {
      await NfcManager.cancelTechnologyRequest();
      await NfcManager.unregisterTagEvent();
    } catch (error) {
      console.log('NFC cleanup (ignorable):', error);
    }
  };

  const initializeNFC = async () => {
    try {
      const supported = await NfcManager.isSupported();
      setNfcSupported(supported);
      
      if (!supported) {
        setError('NFC no está disponible en este dispositivo');
        return;
      }

      await NfcManager.start();
      console.log('✅ NFC Manager iniciado');
      
      const enabled = await NfcManager.isEnabled();
      setNfcEnabled(enabled);
      
      if (!enabled && Platform.OS === 'android') {
        Alert.alert(
          'NFC Desactivado',
          'Necesitas activar NFC para usar esta función',
          [
            { text: 'Cancelar', style: 'cancel' },
            { 
              text: 'Activar NFC', 
              onPress: () => NfcManager.goToNfcSetting() 
            }
          ]
        );
      }
    } catch (error) {
      console.error('Error iniciando NFC:', error);
      setNfcSupported(false);
      setError('Error al inicializar NFC: ' + error.message);
    }
  };

  const loadZones = async () => {
    setLoadingZones(true);
    setError(null);
    
    try {
      console.log('=== CARGANDO ZONAS (ATTENDANCE + ROUNDS) ===');
      console.log('Tenant ID:', user?.tenant_id);
      
      const response = await axios.get(
        `${API_CONFIG.BASE_URL}${ENDPOINTS.ZONES_BY_TYPE}`,
        {
          params: { 
            tenant_id: user?.tenant_id || 1,
            only_without_nfc: 'false'
          },
          timeout: 10000
        }
      );

      console.log('📥 Respuesta completa:', response.data);

      if (response.data.success && response.data.data) {
        // ✅ Filtrar zonas activas de ATTENDANCE O ROUNDS (o ambas)
        const allActiveZones = response.data.data.filter(z => {
          const isActive = z.is_active === '1';
          const isAttendance = z.is_attendance_zone === '1';
          const isRounds = z.is_rounds_zone === '1';
          
          // Incluir si está activa Y (es de Attendance O es de Rounds O ambas)
          return isActive && (isAttendance || isRounds);
        });
        
        // Ordenar: Attendance puro > Rounds puro > Mixtas, luego alfabético
        const sortedZones = allActiveZones.sort((a, b) => {
          const aIsAtt = a.is_attendance_zone === '1';
          const aIsRounds = a.is_rounds_zone === '1';
          const bIsAtt = b.is_attendance_zone === '1';
          const bIsRounds = b.is_rounds_zone === '1';
          
          // Prioridad: Solo Attendance > Solo Rounds > Mixtas
          const aType = aIsAtt && aIsRounds ? 3 : (aIsAtt ? 1 : 2);
          const bType = bIsAtt && bIsRounds ? 3 : (bIsAtt ? 1 : 2);
          
          if (aType !== bType) return aType - bType;
          
          // Mismo tipo: orden alfabético
          return a.zone_name.localeCompare(b.zone_name);
        });
        
        setZones(sortedZones);
        
        if (sortedZones.length === 0) {
          setError('No hay zonas activas disponibles');
        }
        
        console.log(`📍 ${sortedZones.length} zonas cargadas:`);
        
        // Estadísticas detalladas
        const stats = {
          onlyAttendance: sortedZones.filter(z => 
            z.is_attendance_zone === '1' && z.is_rounds_zone !== '1'
          ).length,
          onlyRounds: sortedZones.filter(z => 
            z.is_rounds_zone === '1' && z.is_attendance_zone !== '1'
          ).length,
          both: sortedZones.filter(z => 
            z.is_attendance_zone === '1' && z.is_rounds_zone === '1'
          ).length
        };
        
        console.log('  - Solo Asistencia:', stats.onlyAttendance);
        console.log('  - Solo Rondas:', stats.onlyRounds);
        console.log('  - Ambas:', stats.both);
        
      } else {
        setError('No se pudieron cargar las zonas');
      }
    } catch (error) {
      console.error('❌ Error cargando zonas:', error);
      console.error('Error response:', error.response?.data);
      
      if (error.response?.status === 404) {
        setError('Servicio de zonas no disponible');
      } else if (error.message?.includes('Network')) {
        setError('Sin conexión al servidor');
      } else {
        setError('Error al cargar zonas: ' + error.message);
      }
    } finally {
      setLoadingZones(false);
    }
  };

  const readNFC = async () => {
    if (!nfcSupported || !nfcEnabled) {
      Alert.alert(
        'NFC No Disponible',
        'Verifica que NFC esté activado en tu dispositivo',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Configuración', onPress: () => NfcManager.goToNfcSetting() }
        ]
      );
      return;
    }

    setScanning(true);
    setNfcData(null);
    setError(null);
    setRetryCount(0);
    
    try {
      console.log('📱 Iniciando lectura NFC...');
      
      await cleanupNFC();
      
      const isZebra = Platform.OS === 'android' && 
        (Platform.constants?.Manufacturer?.toLowerCase().includes('zebra') ||
         Platform.constants?.Brand?.toLowerCase().includes('zebra'));
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('timeout')), isZebra ? 60000 : 30000)
      );
      
      const nfcPromise = isZebra ?
        NfcManager.requestTechnology([NfcTech.Ndef, NfcTech.NfcA, NfcTech.IsoDep], {
          alertMessage: 'Acerca el tag NFC al lector ZEBRA (parte trasera del dispositivo)'
        }) :
        NfcManager.requestTechnology(NfcTech.Ndef, {
          alertMessage: 'Acerca el tag NFC al dispositivo'
        });
      
      await Promise.race([nfcPromise, timeoutPromise]);
      
      const tag = await NfcManager.getTag();
      console.log('📱 Tag detectado:', tag);
      
      if (tag) {
        if (Platform.OS === 'ios') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          Vibration.vibrate([0, 100, 50, 100]);
        }
        
        let tagId = '';
        
        if (tag.id) {
          tagId = tag.id;
        }
        
        if (!tagId && tag.ndefMessage?.length > 0) {
          try {
            for (let record of tag.ndefMessage) {
              const payload = Ndef.text.decodePayload(record.payload);
              if (payload) {
                tagId = payload;
                break;
              }
            }
          } catch (e) {
            console.log('No se pudo decodificar NDEF:', e);
          }
        }
        
        if (!tagId && tag.techData) {
          tagId = tag.techData.serialNumber || 
                  tag.techData.uid || 
                  tag.techData.id || 
                  '';
        }
        
        if (!tagId) {
          throw new Error('No se pudo leer el ID del tag');
        }
        
        console.log('✅ Tag ID leído:', tagId);
        
        setNfcData(tagId);
        setSuccessMessage(`Tag NFC leído: ${tagId}`);
        
        setTimeout(() => setSuccessMessage(null), 5000);
      }
    } catch (error) {
      console.error('❌ Error leyendo NFC:', error);
      
      let errorMessage = 'Error leyendo el tag NFC';
      
      if (error.message?.includes('cancelled')) {
        errorMessage = 'Lectura cancelada';
      } else if (error.message?.includes('timeout')) {
        errorMessage = 'Tiempo agotado. Acerca más el tag al lector.';
        
        setRetryCount(prev => prev + 1);
        if (retryCount < 2) {
          Alert.alert(
            'Tiempo Agotado',
            errorMessage + '\n\n¿Deseas intentar nuevamente?',
            [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Reintentar', onPress: readNFC }
            ]
          );
          return;
        }
      } else if (error.message?.includes('NotSupported')) {
        errorMessage = 'NFC no soportado en este dispositivo';
      } else if (error.message?.includes('NotEnabled')) {
        errorMessage = 'NFC está desactivado';
      }
      
      setError(errorMessage);
      Alert.alert('Error', errorMessage);
    } finally {
      await cleanupNFC();
      setScanning(false);
    }
  };

  const assignNFCToZone = async () => {
    if (!selectedZone) {
      Alert.alert('⚠️ Zona Requerida', 'Por favor selecciona una zona');
      return;
    }

    if (!nfcData) {
      Alert.alert('⚠️ NFC Requerido', 'Por favor lee un tag NFC primero');
      return;
    }

    const selectedZoneData = zones.find(z => z.zone_id == selectedZone);
    const typeInfo = getZoneTypeInfo(selectedZoneData);
    
    Alert.alert(
      '🔄 Confirmar Asignación',
      `¿Asignar el NFC "${nfcData}" a:\n\n📍 Zona: ${selectedZoneData?.zone_name}\n🏷️ Tipo: ${typeInfo.label}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar', onPress: performAssignment }
      ]
    );
  };

  const performAssignment = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const selectedZoneData = zones.find(z => z.zone_id == selectedZone);
      const typeInfo = getZoneTypeInfo(selectedZoneData);
      
      console.log('=== ASIGNANDO NFC A ZONA ===');
      console.log('Zona:', selectedZoneData);
      console.log('Tipo:', typeInfo.label);
      console.log('NFC:', nfcData);
      console.log('Usuario:', user);
      
      const requestData = {
        user_id: user.car_user_id || user.user_id,
        tenant_id: user.tenant_id || 1,
        zone_id: parseInt(selectedZone),
        nfc_tag_id: nfcData
      };
      
      const url = `${API_CONFIG.BASE_URL}${ENDPOINTS.SUPERVISOR_NFC}`;
      
      console.log('📤 Enviando a:', url);
      console.log('📦 Datos:', JSON.stringify(requestData, null, 2));

      const response = await axios.post(url, requestData, {
        timeout: 15000,
        headers: {
          'Content-Type': 'application/json',
        }
      });

      console.log('📥 Respuesta:', response.data);

      if (response.data.success) {
        if (Platform.OS === 'ios') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          Vibration.vibrate([0, 100, 50, 200]);
        }
        
        Alert.alert(
          '✅ Éxito', 
          `NFC asignado correctamente a:\n\n📍 ${selectedZoneData?.zone_name}\n🏷️ Tipo: ${typeInfo.label}`,
          [{ 
            text: 'OK', 
            onPress: () => {
              setNfcData(null);
              setSelectedZone(null);
              setSuccessMessage('NFC asignado exitosamente');
              loadZones();
            }
          }]
        );
      } else {
        throw new Error(response.data.error || 'Error desconocido del servidor');
      }
      
    } catch (error) {
      console.error('=== ERROR ASIGNANDO NFC ===');
      console.error('Error completo:', error);
      
      if (Platform.OS === 'ios') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else {
        Vibration.vibrate([0, 300]);
      }
      
      let errorMessage = 'Error al asignar NFC';
      let errorDetail = '';
      
      if (error.response) {
        console.error('Response Status:', error.response.status);
        console.error('Response Data:', error.response.data);
        
        switch(error.response.status) {
          case 400:
            errorMessage = 'Datos Inválidos';
            errorDetail = error.response.data?.error || 'Verifica los datos ingresados';
            break;
          case 401:
            errorMessage = 'No Autorizado';
            errorDetail = 'Tu sesión ha expirado. Por favor vuelve a iniciar sesión.';
            break;
          case 403:
            errorMessage = 'Sin Permisos';
            errorDetail = 'No tienes permisos de supervisor para esta acción.';
            break;
          case 404:
            errorMessage = 'Servicio No Disponible';
            errorDetail = 'El servicio de actualización NFC no está disponible.';
            break;
          case 409:
            errorMessage = 'Conflicto';
            errorDetail = 'Este NFC ya está asignado a otra zona.';
            break;
          case 500:
            errorMessage = 'Error del Servidor';
            errorDetail = error.response.data?.error || 'Error interno del servidor';
            break;
          default:
            errorDetail = error.response.data?.error || `Error ${error.response.status}`;
        }
      } else if (error.request) {
        console.error('Request:', error.request);
        errorMessage = 'Error de Conexión';
        errorDetail = 'No se pudo conectar con el servidor. Verifica tu conexión a internet.';
      } else {
        console.error('Error:', error.message);
        errorDetail = error.message;
      }
      
      setError(`${errorMessage}: ${errorDetail}`);
      
      Alert.alert(
        errorMessage,
        errorDetail,
        [
          { text: 'OK', style: 'default' },
          ...(error.response?.status === 401 ? [{
            text: 'Volver a Login',
            onPress: () => navigation.navigate('Login')
          }] : [])
        ]
      );
    } finally {
      setLoading(false);
    }
  };

  // ✅ Obtener información del tipo de zona
  const getZoneTypeInfo = (zone) => {
    if (!zone) return { icon: 'help', color: '#64748B', label: 'Desconocido' };
    
    const isAtt = zone.is_attendance_zone === '1';
    const isRounds = zone.is_rounds_zone === '1';
    
    // CASO 1: Ambas (Attendance Y Rounds)
    if (isAtt && isRounds) {
      return {
        icon: 'layers',
        color: '#10B981',
        label: 'Asistencia + Rondas'
      };
    }
    
    // CASO 2: Solo Attendance
    if (isAtt) {
      return {
        icon: 'schedule',
        color: '#3B82F6',
        label: 'Asistencia'
      };
    }
    
    // CASO 3: Solo Rounds
    if (isRounds) {
      return {
        icon: 'route',
        color: '#8B5CF6',
        label: 'Rondas'
      };
    }
    
    // Fallback
    return {
      icon: 'help',
      color: '#64748B',
      label: 'Sin tipo'
    };
  };

  if (!user?.is_supervisor) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <MaterialIcons name="block" size={80} color="#EF4444" />
          <Text style={styles.errorTitle}>Acceso Denegado</Text>
          <Text style={styles.errorText}>Solo supervisores pueden usar esta función</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Asignar NFC a Zona</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Mensajes de estado */}
        {successMessage && (
          <View style={styles.successBanner}>
            <MaterialIcons name="check-circle" size={20} color="#10B981" />
            <Text style={styles.successText}>{successMessage}</Text>
          </View>
        )}

        {error && (
          <View style={styles.errorBanner}>
            <MaterialIcons name="error" size={20} color="#EF4444" />
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        )}

        {/* Paso 1: Seleccionar Zona */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>1</Text>
            </View>
            <Text style={styles.sectionTitle}>Seleccionar Zona</Text>
          </View>
          
          {loadingZones ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#3B82F6" />
              <Text style={styles.loadingText}>Cargando zonas...</Text>
            </View>
          ) : zones.length > 0 ? (
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={selectedZone}
                onValueChange={setSelectedZone}
                style={styles.picker}
                dropdownIconColor="#94A3B8"
              >
                <Picker.Item 
                  label="-- Selecciona una zona --" 
                  value={null}
                  color="#64748B"
                />
                {zones.map(zone => {
                  const typeInfo = getZoneTypeInfo(zone);
                  return (
                    <Picker.Item
                      key={zone.zone_id}
                      label={`${zone.zone_name} (${zone.zone_code}) - ${typeInfo.label}${zone.nfc_tag_id ? ' - NFC: ' + zone.nfc_tag_id : ''}`}
                      value={zone.zone_id}
                      color="#FFFFFF"
                    />
                  );
                })}
              </Picker>
              
              {/* Mostrar info de zona seleccionada */}
              {selectedZone && (
                <View style={styles.selectedZoneInfo}>
                  {(() => {
                    const zone = zones.find(z => z.zone_id == selectedZone);
                    const typeInfo = getZoneTypeInfo(zone);
                    return (
                      <>
                        <MaterialIcons name={typeInfo.icon} size={16} color={typeInfo.color} />
                        <Text style={[styles.selectedZoneText, { color: typeInfo.color }]}>
                          {typeInfo.label}
                        </Text>
                      </>
                    );
                  })()}
                </View>
              )}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <MaterialIcons name="location-off" size={48} color="#64748B" />
              <Text style={styles.emptyText}>No hay zonas disponibles</Text>
              <TouchableOpacity onPress={loadZones} style={styles.retryButton}>
                <MaterialIcons name="refresh" size={20} color="#3B82F6" />
                <Text style={styles.retryText}>Reintentar</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Paso 2: Leer NFC */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.stepNumber, !selectedZone && styles.stepNumberDisabled]}>
              <Text style={styles.stepNumberText}>2</Text>
            </View>
            <Text style={[styles.sectionTitle, !selectedZone && styles.sectionTitleDisabled]}>
              Leer Tag NFC
            </Text>
          </View>
          
          {!nfcSupported ? (
            <View style={styles.nfcError}>
              <MaterialIcons name="nfc" size={48} color="#EF4444" />
              <Text style={styles.nfcErrorText}>NFC no disponible</Text>
              <Text style={styles.nfcErrorSubtext}>
                Este dispositivo no soporta NFC o está desactivado
              </Text>
            </View>
          ) : (
            <View style={styles.nfcSection}>
              {nfcData ? (
                <View style={styles.nfcDataCard}>
                  <MaterialIcons name="check-circle" size={32} color="#10B981" />
                  <Text style={styles.nfcDataLabel}>Tag NFC Leído:</Text>
                  <Text style={styles.nfcDataValue}>{nfcData}</Text>
                  <TouchableOpacity 
                    onPress={() => {
                      setNfcData(null);
                      setSuccessMessage(null);
                    }}
                    style={styles.clearButton}
                  >
                    <MaterialIcons name="clear" size={20} color="#EF4444" />
                    <Text style={styles.clearButtonText}>Limpiar</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.nfcButton,
                    (!selectedZone || scanning) && styles.nfcButtonDisabled
                  ]}
                  onPress={readNFC}
                  disabled={!selectedZone || scanning || !nfcEnabled}
                >
                  {scanning ? (
                    <>
                      <ActivityIndicator size="small" color="#FFF" />
                      <Text style={styles.nfcButtonText}>Esperando tag...</Text>
                    </>
                  ) : (
                    <>
                      <MaterialIcons name="nfc" size={32} color="#FFF" />
                      <Text style={styles.nfcButtonText}>Leer Tag NFC</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
              
              {Platform.OS === 'android' && (
                <TouchableOpacity 
                  style={styles.nfcSettings}
                  onPress={() => NfcManager.goToNfcSetting()}
                >
                  <MaterialIcons name="settings" size={16} color="#64748B" />
                  <Text style={styles.nfcSettingsText}>Configuración NFC</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Paso 3: Asignar */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[
              styles.stepNumber, 
              (!selectedZone || !nfcData) && styles.stepNumberDisabled
            ]}>
              <Text style={styles.stepNumberText}>3</Text>
            </View>
            <Text style={[
              styles.sectionTitle, 
              (!selectedZone || !nfcData) && styles.sectionTitleDisabled
            ]}>
              Confirmar Asignación
            </Text>
          </View>
          
          {selectedZone && nfcData ? (
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <MaterialIcons name="location-on" size={20} color="#3B82F6" />
                <Text style={styles.summaryLabel}>Zona:</Text>
                <Text style={styles.summaryValue}>
                  {zones.find(z => z.zone_id == selectedZone)?.zone_name}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                {(() => {
                  const zone = zones.find(z => z.zone_id == selectedZone);
                  const typeInfo = getZoneTypeInfo(zone);
                  return (
                    <>
                      <MaterialIcons name={typeInfo.icon} size={20} color={typeInfo.color} />
                      <Text style={styles.summaryLabel}>Tipo:</Text>
                      <Text style={[styles.summaryValue, { color: typeInfo.color }]}>
                        {typeInfo.label}
                      </Text>
                    </>
                  );
                })()}
              </View>
              <View style={styles.summaryRow}>
                <MaterialIcons name="nfc" size={20} color="#3B82F6" />
                <Text style={styles.summaryLabel}>NFC:</Text>
                <Text style={styles.summaryValue}>{nfcData}</Text>
              </View>
            </View>
          ) : (
            <Text style={styles.instructionText}>
              Completa los pasos anteriores para continuar
            </Text>
          )}
          
          <TouchableOpacity
            style={[
              styles.assignButton,
              (!selectedZone || !nfcData || loading) && styles.assignButtonDisabled
            ]}
            onPress={assignNFCToZone}
            disabled={!selectedZone || !nfcData || loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <MaterialIcons name="save" size={24} color="#FFF" />
                <Text style={styles.assignButtonText}>Asignar NFC a Zona</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: '#10B981',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  successText: {
    color: '#10B981',
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorBannerText: {
    color: '#EF4444',
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  section: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stepNumberDisabled: {
    backgroundColor: '#475569',
  },
  stepNumberText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  sectionTitleDisabled: {
    color: '#64748B',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 12,
    fontSize: 14,
  },
  pickerContainer: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  picker: {
    color: '#FFFFFF',
    height: 56,
  },
  selectedZoneInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  selectedZoneText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    color: '#64748B',
    marginTop: 12,
    fontSize: 14,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
  retryText: {
    color: '#3B82F6',
    marginLeft: 8,
    fontSize: 14,
  },
  nfcError: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  nfcErrorText: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 12,
  },
  nfcErrorSubtext: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  nfcSection: {
    alignItems: 'center',
  },
  nfcButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    minWidth: 200,
  },
  nfcButtonDisabled: {
    backgroundColor: '#475569',
    opacity: 0.6,
  },
  nfcButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 12,
  },
  nfcDataCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: '#10B981',
    borderRadius: 12,
    padding: 20,
    width: '100%',
  },
  nfcDataLabel: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 12,
  },
  nfcDataValue: {
    color: '#10B981',
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginTop: 4,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  clearButtonText: {
    color: '#EF4444',
    fontSize: 12,
    marginLeft: 4,
  },
  nfcSettings: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 8,
  },
  nfcSettingsText: {
    color: '#64748B',
    fontSize: 12,
    marginLeft: 4,
  },
  summaryCard: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryLabel: {
    color: '#94A3B8',
    fontSize: 14,
    marginLeft: 8,
    marginRight: 8,
  },
  summaryValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    flex: 1,
  },
  instructionText: {
    color: '#64748B',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
  assignButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 8,
  },
  assignButtonDisabled: {
    backgroundColor: '#475569',
    opacity: 0.6,
  },
  assignButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  errorTitle: {
    color: '#EF4444',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
  },
  errorText: {
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 8,
  },
});
