import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator
} from 'react-native';
import { getData, STORAGE_KEYS } from '../utils/storage';

export default function HistoryScreen({ route }) {
  const { user } = route.params;
  
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadHistory();
  }, []);

  // CARGAR historial del día
  const loadHistory = async () => {
    setLoading(true);
    
    // Por ahora solo mostramos la última acción guardada localmente
    // En producción, aquí harías una llamada al endpoint:
    // GET /api/attendance/mobile/today/{user_id}
    
    const lastAction = await getData(STORAGE_KEYS.LAST_ACTION);
    const pendingMarks = await getData(STORAGE_KEYS.PENDING_MARKS) || [];
    
    const combinedHistory = [
      ...(lastAction ? [lastAction] : []),
      ...pendingMarks
    ];
    
    setHistory(combinedHistory);
    setLoading(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadHistory();
    setRefreshing(false);
  };

  // RENDERIZAR cada item del historial
  const renderItem = ({ item }) => {
    const isOffline = item.offline || item.queued_at;
    
    return (
      <View style={styles.historyItem}>
        <View style={styles.itemHeader}>
          <Text style={styles.itemType}>
            {item.type?.replace('_', ' ').toUpperCase() || 
             item.attendance_type?.replace('_', ' ').toUpperCase()}
          </Text>
          {isOffline && (
            <View style={styles.offlineBadge}>
              <Text style={styles.offlineBadgeText}>Pendiente</Text>
            </View>
          )}
        </View>
        
        <Text style={styles.itemTime}>
          {new Date(item.timestamp || item.queued_at).toLocaleString('es-CR')}
        </Text>
        
        {item.capture_method && (
          <Text style={styles.itemMethod}>
            Método: {item.capture_method.toUpperCase()}
          </Text>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Historial de Hoy</Text>
        <Text style={styles.subtitle}>{user.name}</Text>
      </View>

      {history.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No hay marcas registradas hoy</Text>
        </View>
      ) : (
        <FlatList
          data={history}
          renderItem={renderItem}
          keyExtractor={(item, index) => index.toString()}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5'
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  header: {
    backgroundColor: '#007AFF',
    padding: 20,
    paddingTop: 60
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff'
  },
  subtitle: {
    fontSize: 14,
    color: '#fff',
    marginTop: 5,
    opacity: 0.9
  },
  list: {
    padding: 20
  },
  historyItem: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  itemType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF'
  },
  offlineBadge: {
    backgroundColor: '#FF9500',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4
  },
  offlineBadgeText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '600'
  },
  itemTime: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4
  },
  itemMethod: {
    fontSize: 12,
    color: '#999'
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  emptyText: {
    fontSize: 16,
    color: '#666'
  }
});
