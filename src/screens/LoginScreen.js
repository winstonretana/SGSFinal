// src/screens/LoginScreen.js - VERSIÓN FINAL COMPLETA
import React, { useState, useEffect } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, 
  ActivityIndicator, SafeAreaView, StatusBar, KeyboardAvoidingView, 
  Platform, Linking, Modal, Image
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { login } from '../services/authService';
import { initGeofencing } from '../services/geofencingService';
import axios from 'axios';
import { API_CONFIG, ENDPOINTS } from '../config/api';

const CURRENT_VERSION = Constants.expoConfig?.version || Constants.manifest?.version || '1.0.0';
const CURRENT_BUILD = Constants.expoConfig?.android?.versionCode || Constants.manifest?.android?.versionCode || 1;

export default function LoginScreen({ navigation }) {
  const [identification, setIdentification] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingVersion, setCheckingVersion] = useState(true);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [showAbout, setShowAbout] = useState(false);

  useEffect(() => {
    checkAppVersion();
  }, []);

  const checkAppVersion = async () => {
    try {
      console.log('========== VERSION CHECK START ==========');
      console.log(`📱 Versión actual de la app: ${CURRENT_VERSION} (Build ${CURRENT_BUILD})`);
      console.log(`🌐 Verificando en: ${API_CONFIG.BASE_URL}${ENDPOINTS.APP_VERSION}`);
      
      const response = await axios.get(
        `${API_CONFIG.BASE_URL}${ENDPOINTS.APP_VERSION}`,
        { 
          params: { tenant_id: 1 },
          timeout: 5000 
        }
      );
      
      console.log('📥 Response status:', response.status);
      console.log('📦 Response data:', JSON.stringify(response.data, null, 2));
      
      if (response.data.success && response.data.data) {
        const rawData = response.data.data;
        
        // ✅ MAPEAR los campos del backend PHP
        const serverVersion = {
          version: rawData.version_number,
          build: parseInt(rawData.build_number),
          min_version: rawData.min_version,
          required_update: rawData.required_update === '1' || rawData.required_update === 1 || rawData.required_update === true,
          changelog: rawData.changelog || '',
          download_url: rawData.download_url || ''
        };
        
        console.log('🔄 Datos mapeados:', JSON.stringify(serverVersion, null, 2));
        console.log(`🌐 Versión del servidor: ${serverVersion.version} (Build ${serverVersion.build})`);
        console.log(`⚠️ Versión mínima requerida: ${serverVersion.min_version}`);
        console.log(`🔒 Force update: ${serverVersion.required_update}`);
        
        if (!serverVersion.version || !serverVersion.min_version) {
          console.warn('⚠️ Respuesta del servidor incompleta');
          setCheckingVersion(false);
          return;
        }
        
        const needsUpdate = compareVersions(CURRENT_VERSION, serverVersion.version) < 0;
        const isMandatory = serverVersion.required_update || 
                           compareVersions(CURRENT_VERSION, serverVersion.min_version) < 0;
        
        console.log(`🔄 ¿Necesita actualización?: ${needsUpdate}`);
        console.log(`🔒 ¿Es obligatoria?: ${isMandatory}`);
        
        if (needsUpdate) {
          setUpdateInfo({ ...serverVersion, mandatory: isMandatory });
          
          if (isMandatory) {
            console.log('🚨 Mostrando modal de actualización OBLIGATORIA');
            showMandatoryUpdateModal(serverVersion);
          } else {
            console.log('ℹ️ Mostrando modal de actualización OPCIONAL');
            showOptionalUpdateModal(serverVersion);
          }
        } else {
          console.log('✅ App actualizada');
        }
      }
      
      console.log('========== VERSION CHECK END (SUCCESS) ==========');
      
    } catch (error) {
      console.error('========== VERSION CHECK END (ERROR) ==========');
      console.error('❌ Error:', error.message);
      console.log('⚠️ Continuando sin verificación de versión');
    } finally {
      setCheckingVersion(false);
    }
  };

  const compareVersions = (v1, v2) => {
    if (!v1 || !v2 || typeof v1 !== 'string' || typeof v2 !== 'string') {
      console.warn('⚠️ Versión inválida:', { v1, v2 });
      return 0;
    }
    
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < 3; i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    
    return 0;
  };

  const showMandatoryUpdateModal = (versionInfo) => {
    Alert.alert(
      '⚠️ Actualización Requerida',
      `Esta versión (${CURRENT_VERSION}) ya no es compatible.\n\nSe requiere actualizar a la versión ${versionInfo.version}\n\n📋 Cambios:\n${versionInfo.changelog}`,
      [
        {
          text: '📥 Descargar Actualización',
          onPress: () => {
            if (versionInfo.download_url) {
              Linking.openURL(versionInfo.download_url);
            } else {
              Alert.alert('Error', 'URL de descarga no disponible');
            }
          }
        }
      ],
      { cancelable: false }
    );
  };

  const showOptionalUpdateModal = (versionInfo) => {
    Alert.alert(
      '🔔 Actualización Disponible',
      `Nueva versión ${versionInfo.version} disponible\n\n📋 Cambios:\n${versionInfo.changelog}`,
      [
        { text: 'Ahora No', style: 'cancel' },
        {
          text: '📥 Actualizar',
          onPress: () => {
            if (versionInfo.download_url) {
              Linking.openURL(versionInfo.download_url);
            }
          }
        }
      ]
    );
  };

  const initGeofencingBackground = async (user) => {
    try {
      const zonesResponse = await axios.get(
        `${API_CONFIG.BASE_URL}/api/attendance/mobile/zones?tenant_id=${user.tenant_id || 1}`,
        { timeout: 5000 }
      );
      
      if (zonesResponse.data.success && zonesResponse.data.data.length > 0) {
        console.log(`✅ ${zonesResponse.data.data.length} zonas cargadas`);
        initGeofencing(zonesResponse.data.data).catch(err => {
          console.log('⚠️ Geofencing error:', err.message);
        });
      }
    } catch (error) {
      console.log('⚠️ Error cargando zonas:', error.message);
    }
  };

  const handleLogin = async () => {
    if (!identification || !pin) {
      Alert.alert('Error', 'Completa todos los campos');
      return;
    }

    if (updateInfo?.mandatory) {
      showMandatoryUpdateModal(updateInfo);
      return;
    }

    setLoading(true);
    
    try {
      console.log('🔐 Intentando login...');
      const response = await login(identification, pin);
      
      if (response.success) {
        console.log('✅ Login exitoso:', response.user.name);
        navigation.replace('Home', { user: response.user });
        
        setTimeout(() => {
          initGeofencingBackground(response.user).catch(err => 
            console.log('Background error:', err.message)
          );
        }, 100);
        
      } else {
        Alert.alert('Error', response.message);
        setLoading(false);
      }
    } catch (error) {
      console.error('❌ Error en handleLogin:', error);
      Alert.alert('Error', 'Error de conexión');
      setLoading(false);
    }
  };

  const handleContact = (type) => {
    switch(type) {
      case 'phone':
        Linking.openURL('tel:+50640003397');
        break;
      case 'sales':
        Linking.openURL('mailto:ventas@suppcenter.global');
        break;
      case 'support':
        Linking.openURL('mailto:soporte@suppcenter.global');
        break;
      case 'web':
        Linking.openURL('https://suppcenter.global');
        break;
    }
  };

  if (checkingVersion) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.checkingText}>Verificando versión...</Text>
          <Text style={styles.versionText}>v{CURRENT_VERSION} (Build {CURRENT_BUILD})</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      
      {/* Botón About */}
      <TouchableOpacity 
        style={styles.aboutButton} 
        onPress={() => setShowAbout(true)}
      >
        <MaterialIcons name="info-outline" size={24} color="#64748B" />
      </TouchableOpacity>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <MaterialIcons name="security" size={60} color="#3B82F6" />
            </View>
            <Text style={styles.title}>SGS Suite</Text>
            <Text style={styles.subtitle}>Control de Seguridad</Text>
            
            {updateInfo && !updateInfo.mandatory && (
              <View style={styles.updateBanner}>
                <MaterialIcons name="info" size={16} color="#F59E0B" />
                <Text style={styles.updateText}>Actualización disponible</Text>
              </View>
            )}
          </View>

          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <MaterialIcons name="badge" size={24} color="#64748B" />
              <TextInput
                style={styles.input}
                placeholder="Identificación"
                value={identification}
                onChangeText={setIdentification}
                autoCapitalize="none"
                placeholderTextColor="#94A3B8"
              />
            </View>

            <View style={styles.inputContainer}>
              <MaterialIcons name="lock" size={24} color="#64748B" />
              <TextInput
                style={styles.input}
                placeholder="PIN"
                value={pin}
                onChangeText={setPin}
                secureTextEntry
                keyboardType="numeric"
                maxLength={6}
                placeholderTextColor="#94A3B8"
              />
            </View>

            <TouchableOpacity 
              style={[styles.button, loading && styles.buttonDisabled]} 
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Text style={styles.buttonText}>Ingresar</Text>
                  <MaterialIcons name="arrow-forward" size={20} color="#FFF" />
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.copyrightText}>© 2025 SuppCenter Global Services</Text>
            <Text style={styles.versionText}>v{CURRENT_VERSION} (Build {CURRENT_BUILD})</Text>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Modal About */}
      <Modal
        visible={showAbout}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowAbout(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity 
              style={styles.modalClose} 
              onPress={() => setShowAbout(false)}
            >
              <MaterialIcons name="close" size={24} color="#94A3B8" />
            </TouchableOpacity>

            <Image 
              source={require('../../assets/adaptive-icon.png')} 
              style={styles.modalLogo}
              resizeMode="contain"
            />

            <Text style={styles.modalTitle}>SGS Suite</Text>
            <Text style={styles.modalVersion}>Versión {CURRENT_VERSION} (Build {CURRENT_BUILD})</Text>

            <View style={styles.contactSection}>
              <TouchableOpacity 
                style={styles.contactItem}
                onPress={() => handleContact('phone')}
              >
                <MaterialIcons name="phone" size={20} color="#3B82F6" />
                <Text style={styles.contactText}>+506 4000-3397</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.contactItem}
                onPress={() => handleContact('sales')}
              >
                <MaterialIcons name="email" size={20} color="#10B981" />
                <Text style={styles.contactText}>ventas@suppcenter.global</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.contactItem}
                onPress={() => handleContact('support')}
              >
                <MaterialIcons name="support-agent" size={20} color="#F59E0B" />
                <Text style={styles.contactText}>soporte@suppcenter.global</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.contactItem}
                onPress={() => handleContact('web')}
              >
                <MaterialIcons name="language" size={20} color="#8B5CF6" />
                <Text style={styles.contactText}>suppcenter.global</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalCopyright}>© 2025 SuppCenter Global Services</Text>
            <Text style={styles.modalRights}>Todos los derechos reservados</Text>
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
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  aboutButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'center',
    paddingTop: 60,
  },
  logoContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#94A3B8',
  },
  updateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 16,
    gap: 8,
  },
  updateText: {
    color: '#92400E',
    fontSize: 12,
    fontWeight: '600',
  },
  form: {
    gap: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#334155',
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#FFF',
  },
  button: {
    backgroundColor: '#3B82F6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    paddingBottom: 40,
  },
  copyrightText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  versionText: {
    color: '#475569',
    fontSize: 12,
  },
  checkingText: {
    color: '#94A3B8',
    fontSize: 16,
    marginTop: 16,
  },
  
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  modalClose: {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: 8,
    zIndex: 10,
  },
  modalLogo: {
    width: 80,
    height: 80,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 4,
  },
  modalVersion: {
    fontSize: 14,
    color: '#94A3B8',
    marginBottom: 24,
  },
  contactSection: {
    width: '100%',
    gap: 12,
    marginBottom: 24,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    padding: 12,
    borderRadius: 12,
    gap: 12,
  },
  contactText: {
    color: '#FFF',
    fontSize: 14,
    flex: 1,
  },
  modalCopyright: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
  },
  modalRights: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 4,
  },
});
