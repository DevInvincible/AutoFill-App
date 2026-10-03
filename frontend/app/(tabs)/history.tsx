import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Linking, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/theme/colors';

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setLoading(false);
      return;
    }
    
    setUserId(session.user.id);

    const { data, error } = await supabase
      .from('job_applications')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setJobs(data);
    }
    setLoading(false);
  };

  const renderItem = ({ item }: { item: any }) => (
    <TouchableOpacity 
      style={styles.card}
      onPress={() => item.job_url && Linking.openURL(item.job_url)}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.company}>{item.company_name}</Text>
        <View style={[styles.statusBadge, { backgroundColor: item.status === 'success' ? Colors.successBg : Colors.warningBg }]}>
          <Text style={[styles.statusText, { color: item.status === 'success' ? Colors.success : Colors.warning }]}>
            {item.status.toUpperCase()}
          </Text>
        </View>
      </View>
      <Text style={styles.jobTitle}>{item.job_title}</Text>
      <Text style={styles.date}>{new Date(item.created_at).toLocaleDateString()}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 40) }]}>
      <Text style={styles.title}>History</Text>
      <Text style={styles.subtitle}>Track your automated applications.</Text>

      {!userId ? (
        <View style={styles.emptyState}>
          <Ionicons name="log-in-outline" size={48} color="#666" />
          <Text style={styles.emptyText}>Log in to your AutoFill Account to track applications.</Text>
        </View>
      ) : loading ? (
        <ActivityIndicator color={Colors.accent} style={{ marginTop: 40 }} />
      ) : jobs.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="document-text-outline" size={48} color="#666" />
          <Text style={styles.emptyText}>No applications yet. Start applying!</Text>
        </View>
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshing={loading}
          onRefresh={fetchJobs}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#8E8E93',
    marginTop: 8,
    marginBottom: 24,
  },
  list: {
    paddingBottom: 100,
  },
  card: {
    backgroundColor: Colors.bgCard,
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  company: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  jobTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  date: {
    color: '#666',
    fontSize: 12,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 100,
  },
  emptyText: {
    color: '#666',
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
});
