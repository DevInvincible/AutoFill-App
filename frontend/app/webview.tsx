import React, { useRef, useState, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, TouchableOpacity, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../src/theme/colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../src/lib/supabase';
import API_URL from '../src/config';

export default function JobWebViewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { url } = useLocalSearchParams<{ url: string }>();
  const webViewRef = useRef<WebView>(null);
  
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Loading job...');
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    AsyncStorage.getItem('@user_profile').then(data => {
      if (data) setProfile(JSON.parse(data));
    });
  }, []);

  const injectExtractionScript = () => {
    const extractScript = \
      (function() {
         try {
           function getLabel(el) {
              let labelText = '';
              if (el.id) {
                  const label = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
                  if (label) labelText = label.innerText.trim();
              }
              if (!labelText) {
                  const parentLabel = el.closest('label');
                  if (parentLabel) labelText = parentLabel.innerText.trim();
              }
              if (!labelText) {
                  const aria = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
                  if (aria) labelText = aria;
              }
              return labelText;
           }

           const inputs = Array.from(document.querySelectorAll("input:not([type='hidden']):not([type='checkbox']):not([type='radio'])")).map(el => {
              if (el.offsetParent === null) return null;
              return {
                 id: el.id,
                 name: el.name,
                 type: el.type,
                 placeholder: el.placeholder,
                 label: getLabel(el),
              };
           }).filter(Boolean);

           window.ReactNativeWebView.postMessage(JSON.stringify({ type: "EXTRACTED_FORM", fields: inputs }));
         } catch (e) {
           window.ReactNativeWebView.postMessage(JSON.stringify({ type: "ERROR", message: e.toString() }));
         }
      })();
    \;
    webViewRef.current?.injectJavaScript(extractScript);
  };

  const handleMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      
      if (data.type === "EXTRACTED_FORM") {
        if (!data.fields || data.fields.length === 0) {
           setStatus('No form fields detected yet.');
           return;
        }

        setStatus('AI is analyzing form...');
        setLoading(true);

        const { data: { session } } = await supabase.auth.getSession();
        
        const response = await fetch(\\/jobs/analyze-local\, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': \Bearer \\
          },
          body: JSON.stringify({
            fields: data.fields,
            profile: profile,
            saved_answers: profile?.saved_answers || {},
            job_context: { job_title: "Detected Job", company_name: "Detected Company" }
          })
        });

        const result = await response.json();
        
        if (result.success && result.agent_response && result.agent_response.answers) {
           setStatus('Filling form...');
           
           // Build fill script
           const actions = result.agent_response.answers;
           const fillScript = \
             (function() {
                const actions = \;
                actions.forEach(action => {
                    if (action.answer !== null && action.answer !== undefined) {
                        // Find by id or name
                        let el = null;
                        if (action.id) el = document.getElementById(action.id);
                        if (!el && action.name) el = document.querySelector('input[name="' + CSS.escape(action.name) + '"]');
                        
                        if (el) {
                            el.value = action.answer;
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }
                });
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: "FILL_COMPLETE" }));
             })();
           \;
           
           webViewRef.current?.injectJavaScript(fillScript);
        } else {
           setLoading(false);
           setStatus('AI analysis failed.');
           Alert.alert('Analysis Failed', result.error || 'Unknown error');
        }
      } else if (data.type === "FILL_COMPLETE") {
        setLoading(false);
        setStatus('Form filled! Review and submit manually.');
      } else if (data.type === "ERROR") {
        console.error("WebView Error:", data.message);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 20) }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>Assisted Mode</Text>
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={injectExtractionScript}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color={Colors.accent} size="small" /> : <Ionicons name="flash" size={20} color={Colors.accent} />}
          <Text style={[styles.actionText, { color: loading ? '#666' : Colors.accent }]}>AutoFill</Text>
        </TouchableOpacity>
      </View>
      
      {status !== '' && (
        <View style={styles.statusBar}>
          <Text style={styles.statusText}>{status}</Text>
        </View>
      )}

      <WebView
        ref={webViewRef}
        source={{ uri: url || 'https://www.indeed.com' }}
        style={styles.webview}
        onMessage={handleMessage}
        onLoadEnd={() => {
           setStatus('Ready to assist.');
           setLoading(false);
        }}
        onLoadStart={() => {
           setStatus('Loading page...');
           setLoading(true);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  backButton: {
    padding: 8,
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  actionText: {
    marginLeft: 4,
    fontWeight: '600',
    fontSize: 14,
  },
  statusBar: {
    backgroundColor: '#111',
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  statusText: {
    color: '#aaa',
    fontSize: 12,
  },
  webview: {
    flex: 1,
    backgroundColor: '#fff',
  }
});
