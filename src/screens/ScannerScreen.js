import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, TouchableOpacity, StyleSheet, Alert, 
  ActivityIndicator, Modal, SafeAreaView, StatusBar,
  Vibration, Platform, Animated, Dimensions
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import NfcManager, { NfcTech, Ndef } from 'react-native-nfc-manager';
import * as Haptics from 'expo-haptics';
import { MaterialIcons } from '@expo/vector-icons';
import { registerAttendance } from '../services/attendanceService';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function ScannerScreen({ route, navigation }) {
  const { user } = route.params || {};
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [mode, setMode] = useState('qr');
  const [scanning, setScanning] = useState(false);
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [scannedData, setScannedData] = useState(null);
  const [torchOn, setTorchOn] = useState(false);
  const [nfcSupported, setNfcSupported] = useState(true);
  const [processing, setProcessing] = useState(false);
  const nfcCleanupRef = useRef(false);
  
  // Animations
  const scanAnimation = useRef(new Animated.Value(0)).current;
  const pulseAnimation = useRef(new Animated.Value(1)).current;
  const fadeAnimation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    initializeNFC();
    startScanAnimation();
    
    return () => {
      cleanupNFC();
      stopScanAnimation();
    };
  }, []);

  useEffect(() => {
    if (scanned) {
      startPulseAnimation();
    } else {
      stopPulseAnimation();
    }
  }, [scanned]);

  const cleanupNFC = async () => {
    try {
      if (!nfcCleanupRef.current) {
        nfcCleanupRef.current = true;
        await NfcManager.cancelTechnologyRequest();
        nfcCleanupRef.current = false;
      }
    } catch (error) {
      console.log('NFC cleanup (normal):', error.message);
      nfcCleanupRef.current = false;
    }
  };

  const initializeNFC = async () => {
    try {
      const supported = await NfcManager.isSupported();
      setNfcSupported(supported);
      if (supported) {
        await NfcManager.start();
        
        const enabled = await NfcManager.isEnabled();
        if (!enabled && Platform.OS === 'android') {
          Alert.alert(
            'NFC Desactivado',
            '¿Deseas activar NFC en configuración?',
            [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Abrir Configuración', onPress: () => NfcManager.goToNfcSetting() }
            ]
          );
        }
      }
    } catch (error) {
      console.error('NFC init error:', error);
      setNfcSupported(false);
    }
  };

  const startScanAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnimation, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(scanAnimation, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const stopScanAnimation = () => {
    scanAnimation.stopAnimation();
  };

  const startPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnimation, {
          toValue: 1.2,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnimation, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const stopPulseAnimation = () => {
    pulseAnimation.stopAnimation();
    pulseAnimation.setValue(1);
  };

  const handleQRScanned = ({ data }) => {
    if (scanned || processing) return;
    
    setScanned(true);
    
    // Feedback
    if (Platform.OS === 'ios') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Vibration.vibrate(100);
    }
    
    // Validate QR data
    const validatedData = validateScanData(data, 'qr');
    if (!validatedData) {
      Alert.alert(
        'Código QR Inválido',
        'Este código QR no pertenece al sistema de asistencia.\n\nVerifica que estés escaneando el código correcto.',
        [{ text: 'Reintentar', onPress: () => setScanned(false) }]
      );
      return;
    }
    
    console.log('✅ QR validado:', validatedData);
    
    setScannedData({ 
      method: 'qr', 
      data: validatedData,
      rawData: data,
      timestamp: new Date().toISOString()
    });
    
    // Fade in success message
    Animated.timing(fadeAnimation, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
    
    // Auto show type selector
    setTimeout(() => setShowTypeSelector(true), 500);
  };

  const validateScanData = (data, method) => {
    if (!data) return null;
    
    const cleanData = data.toString().trim().toUpperCase();
    
    // Aceptar cualquier código que parezca una zona
    // Formato esperado: 2 letras + 3 números (ej: EP001, ZN123)
    const zonePattern = /^[A-Z]{2}\d{3}$/;
    
    if (zonePattern.test(cleanData)) {
      return cleanData;
    }
    
    // Si viene con prefijo QR_, extraer el código
    if (cleanData.startsWith('QR_')) {
      const parts = cleanData.split('_');
      if (parts.length >= 2 && zonePattern.test(parts[1])) {
        return parts[1];
      }
    }
    
    // Para NFC, ser más flexible
    if (method === 'nfc' && cleanData.length >= 3) {
      return cleanData;
    }
    
    return null;
  };

  const readNFC = async () => {
    if (!nfcSupported) {
      Alert.alert(
        'NFC No Disponible', 
        'Tu dispositivo no soporta NFC o está desactivado.\n\nUsa el escáner QR en su lugar.'
      );
      return;
    }

    // Limpiar cualquier solicitud anterior
    await cleanupNFC();
    
    setScanning(true);
    setScannedData(null);
    
    try {
      console.log('Iniciando lectura NFC...');
      
      // Solicitar tecnología NFC con timeout
      await NfcManager.requestTechnology(NfcTech.Ndef, {
        alertMessage: 'Acerca el tag NFC al dispositivo'
      });
      
      const tag = await NfcManager.getTag();
      console.log('Tag detectado:', tag);
      
      if (tag) {
        // Vibración de éxito
        if (Platform.OS === 'ios') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          Vibration.vibrate([0, 100, 50, 100]);
        }
        
        // Extraer datos del tag
        let zoneData = '';
        
        if (tag.id) {
          zoneData = tag.id;
        }
        
        // Intentar leer mensaje NDEF
        if (tag.ndefMessage && tag.ndefMessage.length > 0) {
          try {
            const ndefRecord = tag.ndefMessage[0];
            const payload = Ndef.text.decodePayload(ndefRecord.payload);
            if (payload) {
              zoneData = payload;
            }
          } catch (e) {
            console.log('No se pudo leer NDEF, usando ID del tag');
          }
        }
        
        if (!zoneData) {
          throw new Error('No se pudo leer el contenido del tag');
        }
        
        const validatedData = validateScanData(zoneData, 'nfc');
        if (!validatedData) {
          Alert.alert(
            'Tag NFC No Válido',
            'Este tag NFC no está configurado en el sistema.\n\nContacta al supervisor para configurarlo.',
            [{ text: 'OK', onPress: () => setScanning(false) }]
          );
          return;
        }
        
        console.log('✅ NFC validado:', validatedData);
        
        setScannedData({ 
          method: 'nfc', 
          data: validatedData,
          rawData: zoneData,
          metadata: {
            tagType: tag.type || 'unknown',
            tagId: tag.id
          },
          timestamp: new Date().toISOString()
        });
        
        // Mostrar selector de tipo
        setShowTypeSelector(true);
      }
    } catch (error) {
      console.error('NFC error:', error);
      
      let errorMessage = '';
      let errorTitle = 'Error de Lectura';
      
      // Mensajes de error más claros
      if (error.message?.includes('cancelled')) {
        errorMessage = 'Lectura cancelada. Intenta de nuevo.';
        errorTitle = 'Cancelado';
      } else if (error.message?.includes('timeout')) {
        errorMessage = 'No se detectó ningún tag.\n\nAcerca el tag NFC a la parte trasera del dispositivo.';
        errorTitle = 'Tiempo Agotado';
      } else if (error.message?.includes('NfcNotSupported')) {
        errorMessage = 'Este dispositivo no soporta NFC.';
        errorTitle = 'NFC No Disponible';
      } else if (error.message?.includes('no tech request')) {
        // Ignorar este error, es normal cuando se cancela
        console.log('Tech request cancelado (normal)');
      } else {
        errorMessage = 'No se pudo leer el tag. Intenta de nuevo.';
      }
      
      if (errorMessage) {
        Alert.alert(errorTitle, errorMessage);
      }
    } finally {
      await cleanupNFC();
      setScanning(false);
    }
  };

  const handleAttendance = async (type) => {
    if (processing) return;
    
    setShowTypeSelector(false);
    setProcessing(true);
    
    try {
      console.log('=== INICIANDO REGISTRO ===');
      console.log('Tipo:', type);
      console.log('Zona:', scannedData.data);
      console.log('Método:', scannedData.method);
      
      const result = await registerAttendance(
        user.user_id || user.car_user_id,
        scannedData.data,
        type,
        scannedData.method.toUpperCase(),
        {
          raw: scannedData.rawData,
          metadata: scannedData.metadata,
          scanned_at: scannedData.timestamp
        }
      );
      
      console.log('=== RESULTADO ===', result);
      
      if (result.success) {
        // Vibración de éxito
        if (Platform.OS === 'ios') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          Vibration.vibrate([0, 100, 50, 200]);
        }
        
        const message = result.offline ? 
          '✓ Marca guardada localmente\n\nSe enviará cuando haya conexión.' : 
          '✓ Marca registrada exitosamente';
        
        Alert.alert(
          '✅ Registro Exitoso',
          message,
          [{ 
            text: 'OK', 
            onPress: () => navigation.goBack() 
          }],
          { cancelable: false }
        );
      } else {
        // Vibración de error
        if (Platform.OS === 'ios') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } else {
          Vibration.vibrate([0, 300]);
        }
        
        // MENSAJES DE ERROR HUMANOS
        let errorMessage = result.message || 'No se pudo registrar la marca';
        let errorTitle = '❌ Error';
        
        // Traducir errores del servidor a mensajes humanos
        if (errorMessage.includes('FOREIGN KEY') || errorMessage.includes('user_zones')) {
          errorMessage = 'No estás asignado a esta zona.\n\nContacta a tu supervisor para que te asigne a la zona.';
          errorTitle = '⚠️ Zona No Asignada';
        } else if (errorMessage.includes('Ya tienes entrada registrada')) {
          errorMessage = 'Ya marcaste entrada hoy.\n\nDebes marcar salida antes de volver a entrar.';
          errorTitle = '⚠️ Entrada Duplicada';
        } else if (errorMessage.includes('Ya marcaste salida')) {
          errorMessage = 'Ya marcaste salida.\n\nDebes marcar entrada primero.';
          errorTitle = '⚠️ Salida Duplicada';
        } else if (errorMessage.includes('Debes marcar entrada antes')) {
          errorMessage = 'No has marcado entrada hoy.\n\nDebes marcar entrada antes de marcar salida.';
          errorTitle = '⚠️ Sin Entrada';
        } else if (errorMessage.includes('descanso activo')) {
          errorMessage = 'Tienes un descanso activo.\n\nDebes finalizar el descanso antes de marcar salida.';
          errorTitle = '⚠️ En Descanso';
        } else if (errorMessage.includes('No puedes iniciar otro descanso')) {
          errorMessage = 'Ya estás en descanso.\n\nDebes finalizar el descanso actual primero.';
          errorTitle = '⚠️ Ya En Descanso';
        } else if (errorMessage.includes('No hay descanso activo')) {
          errorMessage = 'No tienes un descanso activo.\n\nDebes iniciar un descanso primero.';
          errorTitle = '⚠️ Sin Descanso';
        } else if (errorMessage.includes('geocerca') || errorMessage.includes('Distancia')) {
          errorMessage = 'Estás muy lejos de la zona.\n\nDebes estar dentro del área permitida para marcar.';
          errorTitle = '📍 Fuera de Zona';
        } else if (errorMessage.includes('LOCATION_ERROR')) {
          errorMessage = 'No se pudo obtener tu ubicación.\n\nActiva el GPS e intenta de nuevo.';
          errorTitle = '📍 Sin GPS';
        } else if (result.code === 'VALIDATION_ERROR') {
          // Mantener el mensaje del servidor si es validación
          errorTitle = '⚠️ Validación';
        } else if (result.code === 'ZONE_VALIDATION_ERROR') {
          // Error específico de validación de zona
          errorTitle = '⚠️ Código No Válido';
        }
        
        Alert.alert(
          errorTitle,
          errorMessage,
          [
            { 
              text: 'Reintentar', 
              onPress: () => {
                setScanned(false);
                setScannedData(null);
                fadeAnimation.setValue(0);
              }
            },
            {
              text: 'Cancelar',
              style: 'cancel',
              onPress: () => navigation.goBack()
            }
          ]
        );
      }
    } catch (error) {
      console.error('Error inesperado:', error);
      Alert.alert(
        '⚠️ Error Inesperado',
        'Ocurrió un error al procesar la marca.\n\nIntenta de nuevo o contacta soporte.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } finally {
      setProcessing(false);
    }
  };

  // Permission handling
  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Cargando permisos...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <View style={styles.permissionCard}>
          <Text style={styles.permIcon}>📷</Text>
          <Text style={styles.permTitle}>Permiso de Cámara Requerido</Text>
          <Text style={styles.permDesc}>
            Necesitamos acceso a la cámara para escanear códigos QR
          </Text>
          <TouchableOpacity style={styles.permButton} onPress={requestPermission}>
            <MaterialIcons name="camera" size={20} color="#FFF" />
            <Text style={styles.permButtonText}>Dar Permiso</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      
      {/* Mode Selector */}
      <View style={styles.modeSelector}>
        <TouchableOpacity 
          style={[styles.modeButton, mode === 'qr' && styles.modeButtonActive]} 
          onPress={() => setMode('qr')}
        >
          <MaterialIcons 
            name="qr-code-scanner" 
            size={24} 
            color={mode === 'qr' ? '#FFF' : '#94A3B8'}
          />
          <Text style={[styles.modeText, mode === 'qr' && styles.modeTextActive]}>
            Código QR
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[
            styles.modeButton, 
            mode === 'nfc' && styles.modeButtonActive,
            !nfcSupported && styles.modeButtonDisabled
          ]} 
          onPress={() => nfcSupported && setMode('nfc')}
          disabled={!nfcSupported}
        >
          <MaterialIcons 
            name="nfc" 
            size={24} 
            color={mode === 'nfc' ? '#FFF' : (!nfcSupported ? '#475569' : '#94A3B8')}
          />
          <Text style={[
            styles.modeText, 
            mode === 'nfc' && styles.modeTextActive,
            !nfcSupported && styles.modeTextDisabled
          ]}>
            NFC
          </Text>
          {!nfcSupported && (
            <View style={styles.disabledBadge}>
              <Text style={styles.disabledBadgeText}>No disponible</Text>
            </View>
          )}
        </TouchableOpacity>
        
        {mode === 'qr' && (
          <TouchableOpacity 
            style={[styles.torchButton, torchOn && styles.torchButtonActive]}
            onPress={() => setTorchOn(!torchOn)}
          >
            <MaterialIcons 
              name={torchOn ? 'flash-on' : 'flash-off'} 
              size={20} 
              color={torchOn ? '#FFF' : '#94A3B8'}
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Scanner Content */}
      {mode === 'qr' ? (
        /* QR Scanner View */
        <View style={styles.scannerContainer}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            onBarcodeScanned={handleQRScanned}
            barcodeScannerSettings={{
              barcodeTypes: ['qr', 'code128', 'code39', 'code93'],
            }}
            enableTorch={torchOn}
          />
          
          <View style={styles.overlay}>
            <View style={styles.scanArea}>
              <View style={styles.scanFrame}>
                <View style={[styles.scanCorner, styles.scanCornerTL]} />
                <View style={[styles.scanCorner, styles.scanCornerTR]} />
                <View style={[styles.scanCorner, styles.scanCornerBL]} />
                <View style={[styles.scanCorner, styles.scanCornerBR]} />
                
                <Animated.View 
                  style={[
                    styles.scanLine,
                    {
                      transform: [{
                        translateY: scanAnimation.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, 230]
                        })
                      }]
                    }
                  ]} 
                />
              </View>
            </View>
            
            <View style={styles.instructionContainer}>
              <Text style={styles.instruction}>
                {scanned ? '✓ Código detectado' : 'Apunta al código QR'}
              </Text>
              {!scanned && (
                <Text style={styles.instructionSub}>
                  Mantén el código dentro del recuadro
                </Text>
              )}
            </View>
            
            {scanned && (
              <Animated.View 
                style={[
                  styles.scannedInfo,
                  {
                    opacity: fadeAnimation,
                    transform: [{
                      scale: pulseAnimation
                    }]
                  }
                ]}
              >
                <MaterialIcons name="check-circle" size={48} color="#10B981" />
                <Text style={styles.scannedText}>Código Escaneado</Text>
                <Text style={styles.scannedData}>{scannedData?.data}</Text>
              </Animated.View>
            )}
          </View>
          
          {scanned && (
            <View style={styles.actionButtons}>
              <TouchableOpacity 
                style={styles.rescanButton} 
                onPress={() => {
                  setScanned(false);
                  setScannedData(null);
                  fadeAnimation.setValue(0);
                }}
              >
                <MaterialIcons name="refresh" size={24} color="#FFF" />
                <Text style={styles.rescanText}>Escanear otro</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ) : (
        /* NFC Reader View */
        <View style={styles.nfcContainer}>
          <View style={styles.nfcContent}>
            <Animated.View 
              style={[
                styles.nfcIconContainer,
                scanning && {
                  transform: [{
                    scale: pulseAnimation
                  }]
                }
              ]}
            >
              <MaterialIcons 
                name="nfc" 
                size={100} 
                color={scanning ? '#3B82F6' : '#64748B'}
              />
              {scanning && (
                <ActivityIndicator 
                  style={styles.nfcSpinner} 
                  size="large" 
                  color="#3B82F6" 
                />
              )}
            </Animated.View>
            
            <Text style={styles.nfcTitle}>
              {scanning ? 'Esperando Tag NFC...' : 'Lector NFC'}
            </Text>
            
            <Text style={styles.nfcDesc}>
              {scanning ? 
                'Acerca el tag NFC a la parte posterior del dispositivo' : 
                'Presiona el botón para activar el lector NFC'
              }
            </Text>
            
            {scannedData && (
              <View style={styles.nfcDataCard}>
                <Text style={styles.nfcDataLabel}>Tag Detectado:</Text>
                <Text style={styles.nfcDataValue}>{scannedData.data}</Text>
                {scannedData.metadata?.tagType && (
                  <Text style={styles.nfcDataMeta}>
                    Tipo: {scannedData.metadata.tagType}
                  </Text>
                )}
              </View>
            )}
            
            <View style={styles.nfcActions}>
              {!scanning ? (
                <TouchableOpacity 
                  style={styles.nfcButton} 
                  onPress={readNFC}
                >
                  <MaterialIcons name="contactless" size={32} color="#FFF" />
                  <Text style={styles.nfcButtonText}>Iniciar Lectura</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity 
                  style={[styles.nfcButton, styles.nfcButtonCancel]} 
                  onPress={async () => {
                    await cleanupNFC();
                    setScanning(false);
                  }}
                >
                  <MaterialIcons name="close" size={24} color="#FFF" />
                  <Text style={styles.nfcButtonText}>Cancelar</Text>
                </TouchableOpacity>
              )}
            </View>
            
            {Platform.OS === 'android' && (
              <TouchableOpacity 
                style={styles.nfcSettingsLink}
                onPress={() => NfcManager.goToNfcSetting()}
              >
                <MaterialIcons name="settings" size={16} color="#64748B" />
                <Text style={styles.nfcSettingsText}>Configuración NFC</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
      
      {/* Type Selector Modal */}
      <Modal 
        visible={showTypeSelector} 
        transparent 
        animationType="slide"
        onRequestClose={() => { 
          if (!processing) {
            setShowTypeSelector(false); 
            setScanned(false);
            setScannedData(null);
            fadeAnimation.setValue(0);
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Selecciona el Tipo de Marca</Text>
              <Text style={styles.modalSubtitle}>
                Zona: <Text style={styles.modalZoneCode}>{scannedData?.data}</Text>
              </Text>
              <Text style={styles.modalTimestamp}>
                {new Date().toLocaleTimeString('es-CR', { 
                  hour: '2-digit', 
                  minute: '2-digit',
                  second: '2-digit'
                })}
              </Text>
            </View>
            
            {processing ? (
              <View style={styles.processingContainer}>
                <ActivityIndicator size="large" color="#3B82F6" />
                <Text style={styles.processingText}>Registrando marca...</Text>
                <Text style={styles.processingSubtext}>Por favor espera</Text>
              </View>
            ) : (
              <>
                <View style={styles.typeButtons}>
                  <TouchableOpacity 
                    style={[styles.typeButton, styles.typeButtonCheckIn]} 
                    onPress={() => handleAttendance('check_in')}
                    disabled={processing}
                  >
                    <View style={styles.typeButtonIcon}>
                      <MaterialIcons name="login" size={36} color="#FFF" />
                    </View>
                    <View style={styles.typeButtonContent}>
                      <Text style={styles.typeText}>ENTRADA</Text>
                      <Text style={styles.typeSub}>Iniciar jornada laboral</Text>
                    </View>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[styles.typeButton, styles.typeButtonCheckOut]} 
                    onPress={() => handleAttendance('check_out')}
                    disabled={processing}
                  >
                    <View style={styles.typeButtonIcon}>
                      <MaterialIcons name="logout" size={36} color="#FFF" />
                    </View>
                    <View style={styles.typeButtonContent}>
                      <Text style={styles.typeText}>SALIDA</Text>
                      <Text style={styles.typeSub}>Finalizar jornada laboral</Text>
                    </View>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[styles.typeButton, styles.typeButtonBreakStart]} 
                    onPress={() => handleAttendance('break_start')}
                    disabled={processing}
                  >
                    <View style={styles.typeButtonIcon}>
                      <MaterialIcons name="free-breakfast" size={36} color="#FFF" />
                    </View>
                    <View style={styles.typeButtonContent}>
                      <Text style={styles.typeText}>INICIAR DESCANSO</Text>
                      <Text style={styles.typeSub}>Tomar un break</Text>
                    </View>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[styles.typeButton, styles.typeButtonBreakEnd]} 
                    onPress={() => handleAttendance('break_end')}
                    disabled={processing}
                  >
                    <View style={styles.typeButtonIcon}>
                      <MaterialIcons name="work" size={36} color="#FFF" />
                    </View>
                    <View style={styles.typeButtonContent}>
                      <Text style={styles.typeText}>TERMINAR DESCANSO</Text>
                      <Text style={styles.typeSub}>Volver al trabajo</Text>
                    </View>
                  </TouchableOpacity>
                </View>
                
                <TouchableOpacity 
                  style={styles.cancelButton}
                  onPress={() => {
                    setShowTypeSelector(false);
                    setScanned(false);
                    setScannedData(null);
                    fadeAnimation.setValue(0);
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancelar</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Container styles
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 16,
    fontSize: 14,
  },
  
  // Permission styles
  permissionCard: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 32,
    marginHorizontal: 24,
    alignItems: 'center',
  },
  permIcon: {
    fontSize: 60,
    marginBottom: 16,
  },
  permTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  permDesc: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 24,
  },
  permButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  permButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  
  // Mode selector styles
  modeSelector: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    margin: 16,
    padding: 4,
    borderRadius: 16,
    position: 'relative',
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    position: 'relative',
  },
  modeButtonActive: {
    backgroundColor: '#3B82F6',
  },
  modeButtonDisabled: {
    opacity: 0.5,
  },
  modeText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
  },
  modeTextActive: {
    color: '#FFFFFF',
  },
  modeTextDisabled: {
    color: '#475569',
  },
  disabledBadge: {
    position: 'absolute',
    top: -4,
    right: 8,
    backgroundColor: '#EF4444',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  disabledBadgeText: {
    fontSize: 9,
    color: '#FFF',
    fontWeight: 'bold',
  },
  torchButton: {
    position: 'absolute',
    right: 16,
    alignSelf: 'center',
    padding: 8,
    borderRadius: 8,
  },
  torchButtonActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
  },
  
  // Scanner styles
  scannerContainer: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanArea: {
    width: 280,
    height: 280,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: 250,
    height: 250,
    position: 'relative',
  },
  scanCorner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: '#3B82F6',
  },
  scanCornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 12,
  },
  scanCornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 12,
  },
  scanCornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 12,
  },
  scanCornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 12,
  },
  scanLine: {
    position: 'absolute',
    left: 10,
    right: 10,
    height: 2,
    backgroundColor: '#3B82F6',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
  },
  instructionContainer: {
    position: 'absolute',
    bottom: 100,
    alignItems: 'center',
  },
  instruction: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 24,
  },
  instructionSub: {
    color: '#CBD5E1',
    fontSize: 12,
    marginTop: 8,
  },
  scannedInfo: {
    position: 'absolute',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    padding: 24,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#10B981',
  },
  scannedText: {
    color: '#10B981',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 12,
  },
  scannedData: {
    color: '#6EE7B7',
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginTop: 4,
  },
  actionButtons: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
  },
  rescanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  rescanText: {
    color: '#FFF',
    fontSize: 16,
    marginLeft: 8,
  },
  
  // NFC styles
  nfcContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  nfcContent: {
    padding: 24,
    alignItems: 'center',
  },
  nfcIconContainer: {
    marginBottom: 32,
    position: 'relative',
  },
  nfcSpinner: {
    position: 'absolute',
    alignSelf: 'center',
    top: '35%',
  },
  nfcTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  nfcDesc: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  nfcDataCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#10B981',
    minWidth: 200,
  },
  nfcDataLabel: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 4,
  },
  nfcDataValue: {
    color: '#10B981',
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  nfcDataMeta: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 4,
  },
  nfcActions: {
    marginBottom: 24,
  },
  nfcButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
    minWidth: 200,
  },
  nfcButtonCancel: {
    backgroundColor: '#EF4444',
  },
  nfcButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 12,
  },
  nfcSettingsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  nfcSettingsText: {
    color: '#64748B',
    fontSize: 12,
    marginLeft: 4,
  },
  
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 4,
  },
  modalZoneCode: {
    color: '#3B82F6',
    fontWeight: 'bold',
  },
  modalTimestamp: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
  processingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  processingText: {
    color: '#94A3B8',
    marginTop: 16,
    fontSize: 14,
  },
  processingSubtext: {
    color: '#64748B',
    marginTop: 4,
    fontSize: 12,
  },
  typeButtons: {
    marginBottom: 16,
  },
  typeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  typeButtonIcon: {
    width: 56,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  typeButtonContent: {
    flex: 1,
    marginLeft: 16,
  },
  typeButtonCheckIn: {
    backgroundColor: '#10B981',
  },
  typeButtonCheckOut: {
    backgroundColor: '#EF4444',
  },
  typeButtonBreakStart: {
    backgroundColor: '#F59E0B',
  },
  typeButtonBreakEnd: {
    backgroundColor: '#8B5CF6',
  },
  typeText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  typeSub: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12,
    marginTop: 2,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  cancelButtonText: {
    color: '#94A3B8',
    fontSize: 16,
  },
});
