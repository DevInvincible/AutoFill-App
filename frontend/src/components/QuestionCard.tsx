import React from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { AgentAnswer } from '../services/api';

interface QuestionCardProps {
  question: AgentAnswer;
  userAnswer: string;
  onAnswerChange: (value: string) => void;
}

export default function QuestionCard({
  question,
  userAnswer,
  onAnswerChange,
}: QuestionCardProps) {
  const isAutoAnswered = !question.needs_user_input && question.answer !== null;
  const hasOptions = question.options && question.options.length > 0;

  let sourceTag = 'From your profile';
  let tagColor = '#4facfe'; // blue
  if (!isAutoAnswered) {
    sourceTag = 'Needs you';
    tagColor = '#FFA726'; // amber
  } else if (question.confidence < 1.0) {
    sourceTag = 'AI suggested';
  }

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.question}>{question.question}</Text>
        <View style={[styles.badgeContainer, { backgroundColor: `${tagColor}15` }]}>
          <Text style={[styles.label, { color: tagColor }]}>
            {sourceTag}
          </Text>
        </View>
      </View>

      {/* Answer Area */}
      {isAutoAnswered ? (
        <View style={styles.inputWrapper}>
          <TextInput
            style={[styles.input, styles.inputDisabled]}
            value={Array.isArray(question.answer) ? question.answer.join(', ') : (question.answer || '')}
            editable={false}
          />
          <Feather name="edit-2" size={14} color="#666" style={{ position: 'absolute', right: 16, top: 18 }} />
        </View>
      ) : hasOptions ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.optionsRow}
          contentContainerStyle={{ gap: 8 }}
        >
          {question.options.map((opt: any, idx: number) => {
            const optLabel = typeof opt === 'string' ? opt : opt.label || opt.text || opt.value || String(opt);
            const isSelected = userAnswer === optLabel;

            return (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.optionChip,
                  isSelected && styles.optionChipSelected,
                ]}
                onPress={() => onAnswerChange(optLabel)}
                activeOpacity={0.7}
              >
                <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                  {optLabel}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : (
        <View style={styles.inputWrapper}>
          <TextInput
            style={[styles.input, { borderColor: userAnswer ? '#4facfe' : 'rgba(255,255,255,0.1)' }]}
            value={userAnswer}
            onChangeText={onAnswerChange}
            placeholder="Type your answer..."
            placeholderTextColor="#666"
            multiline={question.field_type === 'textarea'}
            numberOfLines={question.field_type === 'textarea' ? 4 : 1}
            selectionColor="#4facfe"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    justifyContent: 'space-between',
  },
  badgeContainer: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 8,
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  confidence: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.success,
  },
  question: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  answerBox: {
    backgroundColor: 'rgba(0, 255, 157, 0.05)',
    borderLeftWidth: 2,
    borderLeftColor: Colors.success,
    borderRadius: 8,
    padding: 12,
  },
  answerText: {
    fontSize: 15,
    color: Colors.white,
    lineHeight: 22,
    fontWeight: '500',
  },
  source: {
    fontSize: 11,
    color: Colors.success,
    marginTop: 8,
    opacity: 0.8,
  },
  inputWrapper: {
    backgroundColor: '#11131A',
    borderRadius: 8,
  },
  input: {
    padding: 16,
    minHeight: 56,
    borderWidth: 1,
    borderRadius: 8,
    fontSize: 15,
    color: Colors.white,
    fontWeight: '500',
  },
  inputDisabled: {
    borderColor: 'rgba(255,255,255,0.05)',
    color: '#888',
  },
  optionsRow: {
    flexDirection: 'row',
  },
  optionChip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  optionChipSelected: {
    backgroundColor: 'rgba(0, 240, 255, 0.1)',
    borderColor: Colors.accentStart,
  },
  optionText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  optionTextSelected: {
    color: Colors.accentStart,
    fontWeight: '800',
  },
});
