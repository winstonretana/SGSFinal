// src/screens/CheckpointScannerScreen.js
// NFC on-demand (modal), QR automático, validación de pertenencia

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  SafeAreaView, StatusBar, ActivityIndicator, Platform, Vibration, Modal
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import NfcManager, { NfcTech, Ndef } from 'react-native-nfc-manager';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { completeCheckpoint } from '../services/roundsService';
import { validateCheckpointScan } from '../utils/checkpointValidator';

export default function CheckpointScannerScreen({ route, navigation }) {
  const { 
    user, 
    assignmentId, 
    checkpoint, 
    userLocation, 
    distance, 
    notes,
    completedCheckpoints = [],
    allCheckpoints = []
  } = route.params || {};
  
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [mode, setMode] = useState('qr');
  const [showNFCModal, setShowNFCModal] = useState(false);
  const [nfcScanning, setNfcScanning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [nfcSupported, setNfcSupported] = useState(true);

  useEffect(() => {
    initializeNFC();
    return () => cleanupNFC();
  }, []);

  const cleanupNFC = async () => {
    try {
      await NfcManager.cancelTechnologyRequest();
    } catch (error) {
      // Ignorar
    }
  };

  const initializeNFC = async () => {
    try {
      const supported = await NfcManager.isSupported();
      setNfcSupported(supported);
      if (supported) {
        await NfcManager.start();
      }
    } catch (error) {
      console.error('NFC init error:', error);
      setNfcSupported(false);
    }
  };

  const handleQRScanned = ({ data }) => {
    if (scanned || processing) return;
    
    setScanned(true);
    
    if (Platform.OS === 'ios') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Vibration.vibrate(100);
    }
    
    processCheckpointData(data, 'qr');
  };

  const startNFCScan = async () => {
    if (!nfcSupported) {
      Alert.alert('❌ NFC No Disponible', 'Este dispositivo no soporta NFC');
      return;
    }

    setShowNFCModal(true);
    setNfcScanning(true);

    try {
      await NfcManager.requestTechnology(NfcTech.Ndef, {
        alertMessage: 'Acerca el dispositivo al tag NFC'
      });

      const tag = await NfcManager.getTag();
      console.log('NFC Tag:', tag);

      let nfcData = '';
      
      if (tag.ndefMessage && tag.ndefMessage.length > 0) {
        const record = tag.ndefMessage[0];
        nfcData = Ndef.text.decodePayload(record.payload);
      } else if (tag.id) {
        nfcData = tag.id;
      }

      if (nfcData) {
        if (Platform.OS === 'ios') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          Vibration.vibrate(100);
        }
        processCheckpointData(nfcData, 'nfc');
      } else {
        Alert.alert('❌ Error', 'No se pudo leer el tag NFC');
        setNfcScanning(false);
      }
    } catch (error) {
      console.error('NFC scan error:', error);
      if (error.toString().includes('cancelled')) {
        // Usuario canceló
      } else {
        Alert.alert('❌ Error NFC', 'No se pudo leer el tag');
      }
      setNfcScanning(false);
    } finally {
      await cleanupNFC();
    }
  };

  const processCheckpointData = async (scannedData, method) => {
    setProcessing(true);

    // VALIDAR con checkpointValidator
    const validation = validateCheckpointScan(
      scannedData,
      checkpoint,
      completedCheckpoints,
      allCheckpoints
    );

    console.log('Validation result:', validation);

    if (!validation.isValid) {
      const errorMessage = validation.errors.map(e => e.message).join('\n\n');
      Alert.alert('❌ Validación Fallida', errorMessage, [
        { 
          text: 'OK', 
          onPress: () => {
            setScanned(false);
            setNfcScanning(false);
            setShowNFCModal(false);
            setProcessing(false);
          }
        }
      ]);
      return;
    }

    // Mostrar warnings si los hay
    if (validation.warnings.length > 0) {
      const warningMessage = validation.warnings.map(w => w.message).join('\n\n');
      console.warn('Warnings:', warningMessage);
    }

    // Completar checkpoint
    try {
      const result = await completeCheckpoint(
        assignmentId,
        checkpoint.roadmap_zone_id,
        userLocation?.latitude,
        userLocation?.longitude,
        distance,
        notes,
        validation.scanMethod
      );

      if (result.success) {
        const methodLabel = method === 'nfc' ? 'NFC' : 'QR';
        Alert.alert(
          '✅ Completado',
          `${checkpoint.zone_name} marcado con ${methodLabel}`,
          [
            {
              text: 'OK',
              onPress: () => {
                setShowNFCModal(false);
                navigation.navigate('ActiveRoundScreen');
              }
            }
          ],
          { cancelable: false }
        );
      } else {
        Alert.alert('❌ Error', result.message || 'No se pudo completar');
        setScanned(false);
        setNfcScanning(false);
        setShowNFCModal(false);
      }
    } catch (error) {
      console.error('Error completing checkpoint:', error);
      Alert.alert('❌ Error', error.message);
      setScanned(false);
      setNfcScanning(false);
      setShowNFCModal(false);
    } finally {
      setProcessing(false);
    }
  };

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <MaterialIcons name="camera" size={80} color="#64748B" />
        <Text style={styles.permText}>Permiso de cámara requerido</Text>
        <TouchableOpacity style={styles.permButton} onPress={requestPermission}>
          <Text style={styles.permButtonText}>Dar Permiso</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{checkpoint.zone_name}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* SELECTOR DE MODO */}
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
            📷 Escanear QR
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[
            styles.modeButton, 
            mode === 'nfc' && styles.modeButtonActive,
            !nfcSupported && styles.modeButtonDisabled
          ]} 
          onPress={() => {
            if (nfcSupported) {
              setMode('nfc');
              startNFCScan();
            }
          }}
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
            📱 Escanear NFC
          </Text>
        </TouchableOpacity>
      </View>

      {/* CÁMARA QR */}
      {mode === 'qr' && (
        <View style={styles.cameraContainer}>
          <CameraView
            style={styles.camera}
            onBarcodeScanned={scanned ? undefined : handleQRScanned}
            barcodeScannerSettings={{
              barcodeTypes: ['qr'],
            }}
          />
          
          <View style={styles.overlay}>
            <View style={styles.scanArea} />
          </View>

          {scanned && (
            <View style={styles.scannedOverlay}>
              <ActivityIndicator size="large" color="#FFF" />
              <Text style={styles.scannedText}>Procesando...</Text>
            </View>
          )}
        </View>
      )}

      {/* INSTRUCCIONES */}
      <View style={styles.instructions}>
        <Text style={styles.instructionsText}>
          {mode === 'qr' 
            ? '📷 Apunta la cámara al código QR'
            : '📱 Toca el botón para activar NFC'
          }
        </Text>
      </View>

      {/* MODAL NFC */}
      <Modal
        visible={showNFCModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          if (!nfcScanning) {
            setShowNFCModal(false);
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {nfcScanning ? (
              <>
                <MaterialIcons name="nfc" size={80} color="#8B5CF6" />
                <Text style={styles.modalTitle}>Acerca el Tag NFC</Text>
                <Text style={styles.modalText}>
                  Coloca tu dispositivo cerca del tag NFC del checkpoint
                </Text>
                <ActivityIndicator size="large" color="#8B5CF6" style={{ marginTop: 20 }} />
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={async () => {
                    await cleanupNFC();
                    setNfcScanning(false);
                    setShowNFCModal(false);
                  }}
                >
                  <Text style={styles.modalCancelText}>Cancelar</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <MaterialIcons name="check-circle" size={80} color="#10B981" />
                <Text style={styles.modalTitle}>¡Tag Detectado!</Text>
                <ActivityIndicator size="large" color="#10B981" />
              </>
            )}
          </View>
        </View>
      </Modal>
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
    backgroundColor: '#0F172A',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
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
    color: '#FFF',
    marginHorizontal: 12,
  },
  headerSpacer: {
    width: 40,
  },
  modeSelector: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#1E293B',
    borderWidth: 2,
    borderColor: '#334155',
    gap: 8,
  },
  modeButtonActive: {
    backgroundColor: '#8B5CF6',
    borderColor: '#8B5CF6',
  },
  modeButtonDisabled: {
    opacity: 0.4,
  },
  modeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
  },
  modeTextActive: {
    color: '#FFF',
  },
  modeTextDisabled: {
    color: '#475569',
  },
  cameraContainer: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanArea: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: '#8B5CF6',
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  scannedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannedText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 20,
  },
  instructions: {
    padding: 20,
    backgroundColor: '#1E293B',
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  instructionsText: {
    color: '#FFF',
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '600',
  },
  permText: {
    color: '#94A3B8',
    fontSize: 16,
    marginTop: 16,
    marginBottom: 24,
  },
  permButton: {
    backgroundColor: '#8B5CF6',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  permButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1E293B',
    padding: 32,
    borderRadius: 16,
    alignItems: 'center',
    width: '80%',
    maxWidth: 400,
  },
  modalTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
  },
  modalText: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  modalCancelButton: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: '#334155',
  },
  modalCancelText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
