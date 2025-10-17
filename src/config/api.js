// src/config/api.js
export const API_CONFIG = {
  BASE_URL: 'https://suppcenter.global/core',
  TIMEOUT: 15000
};

export const ENDPOINTS = {
  // Autenticación
  LOGIN: '/api/mobile/login',
  VALIDATE_PIN: '/api/mobile/validate-pin',
  APP_VERSION: '/api/mobile/version',
  
  // Zonas (compartido)
  USER_ZONES: '/api/mobile/zones', // ✅ Este es el correcto
  VALIDATE_CODE: '/api/mobile/validate-code',
  ZONES_BY_TYPE: '/api/mobile/zones/by-type',
  
  // ATTENDANCE (Asistencia)
  ATTENDANCE_CHECK: '/api/mobile/attendance/check',
  ATTENDANCE_STATUS: '/api/mobile/attendance/status',
  
  // ROUNDS (Rondas)
  ROUNDS_ASSIGNMENTS: '/api/mobile/rounds/assignments',
  ROUNDS_START: '/api/mobile/rounds/start',
  ROUNDS_PROGRESS: '/api/mobile/rounds/progress',
  ROUNDS_CHECKPOINT_COMPLETE: '/api/mobile/rounds/checkpoint/complete',
  ROUNDS_CHECKPOINT_SKIP: '/api/mobile/rounds/checkpoint/skip',
  ROUNDS_COMPLETE: '/api/mobile/rounds/complete',
  
  // SENTINEL (Tracking GPS)
  SENTINEL_TRACK: '/api/mobile/sentinel/track', // ✅ Este es el correcto
  SENTINEL_POSITION: '/api/mobile/sentinel/position',
  
  // PANIC (Alertas de emergencia)
  PANIC_CREATE: '/api/mobile/panic',
  PANIC_ACTIVE: '/api/mobile/panic/active',
  
  // SUPERVISOR - Admin NFC
  SUPERVISOR_NFC: '/api/attendance/supervisor/nfc'
};
