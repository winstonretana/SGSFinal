// src/utils/checkpointValidator.js
// Validación de checkpoints: orden secuencial, duplicados, pertenencia QR/NFC

export const validateCheckpointScan = (scannedData, checkpoint, completedCheckpoints, allCheckpoints) => {
  const errors = [];
  const warnings = [];

  // 1. VALIDAR PERTENENCIA (QR/NFC correcto)
  const cleanScanned = scannedData.toString().trim().toUpperCase();
  const checkpointCode = (checkpoint.zone_code || '').toString().toUpperCase();
  const checkpointNFC = (checkpoint.nfc_tag_id || '').toString().toUpperCase();

  const isQRMatch = cleanScanned === checkpointCode;
  const isNFCMatch = cleanScanned === checkpointNFC;

  if (!isQRMatch && !isNFCMatch) {
    errors.push({
      code: 'WRONG_CODE',
      message: `❌ Código incorrecto\n\nEscaneaste: ${cleanScanned}\nEsperado: ${checkpointCode}`,
      severity: 'error'
    });
  }

  // 2. VALIDAR DUPLICADOS
  const alreadyCompleted = completedCheckpoints.some(
    cp => cp.roadmap_zone_id === checkpoint.roadmap_zone_id
  );

  if (alreadyCompleted) {
    errors.push({
      code: 'DUPLICATE',
      message: '⚠️ Checkpoint ya completado\n\nEste checkpoint ya fue marcado en esta ronda.',
      severity: 'error'
    });
  }

  // 3. VALIDAR ORDEN SECUENCIAL
  const sortedCheckpoints = [...allCheckpoints].sort((a, b) => a.sequence_order - b.sequence_order);
  const currentIndex = sortedCheckpoints.findIndex(cp => cp.roadmap_zone_id === checkpoint.roadmap_zone_id);
  
  if (currentIndex > 0) {
    const previousCheckpoint = sortedCheckpoints[currentIndex - 1];
    const isPreviousCompleted = completedCheckpoints.some(
      cp => cp.roadmap_zone_id === previousCheckpoint.roadmap_zone_id
    );

    if (!isPreviousCompleted) {
      errors.push({
        code: 'OUT_OF_ORDER',
        message: `🔢 Orden incorrecto\n\nDebes completar primero:\n"${previousCheckpoint.zone_name}" (#${previousCheckpoint.sequence_order})`,
        severity: 'warning'
      });
    }
  }

  // 4. VALIDAR MÉTODO DE ESCANEO
  const scanMethod = isQRMatch ? 'qr' : isNFCMatch ? 'nfc' : null;
  const zoneType = checkpoint.zone_type || 'hybrid';

  if (scanMethod === 'qr' && zoneType === 'nfc_only') {
    warnings.push({
      code: 'WRONG_METHOD',
      message: '📱 Este checkpoint requiere escaneo NFC',
      severity: 'warning'
    });
  }

  if (scanMethod === 'nfc' && zoneType === 'qr_only') {
    warnings.push({
      code: 'WRONG_METHOD',
      message: '📷 Este checkpoint requiere escaneo QR',
      severity: 'warning'
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    scanMethod,
    scannedData: cleanScanned
  };
};

export const getNextAllowedCheckpoint = (completedCheckpoints, allCheckpoints) => {
  const sortedCheckpoints = [...allCheckpoints].sort((a, b) => a.sequence_order - b.sequence_order);
  
  for (const checkpoint of sortedCheckpoints) {
    const isCompleted = completedCheckpoints.some(
      cp => cp.roadmap_zone_id === checkpoint.roadmap_zone_id
    );
    
    if (!isCompleted) {
      return checkpoint;
    }
  }
  
  return null; // Todos completados
};

export const calculateProgress = (completedCheckpoints, totalCheckpoints) => {
  if (totalCheckpoints === 0) return 0;
  return Math.round((completedCheckpoints.length / totalCheckpoints) * 100);
};

export const canCompleteCheckpoint = (checkpoint, completedCheckpoints, allCheckpoints) => {
  const validation = validateCheckpointScan(
    checkpoint.zone_code, 
    checkpoint, 
    completedCheckpoints, 
    allCheckpoints
  );
  
  const hasCriticalErrors = validation.errors.some(e => e.severity === 'error');
  return !hasCriticalErrors;
};
