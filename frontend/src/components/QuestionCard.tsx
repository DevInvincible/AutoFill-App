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

  return (
    <View
      style={[
        styles.card,
        isAutoAnswered ? styles.autoCard : styles.userCard,
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.badgeContainer}>
          <Feather
            name={isAutoAnswered ? "check" : "edit-2"}
            size={12}
            color={isAutoAnswered ? Colors.success : Colors.warning}
          />
          <Text style={[styles.label, { color: isAutoAnswered ? Colors.success : Colors.warning }]}>
            {isAutoAnswered ? 'AUTO-ANSWERED' : 'NEEDS INPUT'}
          </Text>
        </View>
        {isAutoAnswered && question.confidence > 0 && (
          <Text style={styles.confidence}>
            {Math.round(question.confidence * 100)}% Match
          </Text>
        )}
      </View>

      {/* Question */}
      <Text style={styles.question}>{question.question}</Text>

      {/* Answer Area */}
      {isAutoAnswered ? (
        <View style={styles.answerBox}>
          <Text style={styles.answerText}>
            {Array.isArray(question.answer)
              ? question.answer.join(', ')
              : question.answer}
          </Text>
          {question.answer_source && (
            <Text style={styles.source}>
              <Feather name="info" size={10} /> {question.answer_source}
            </Text>
          )}
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
            style={styles.input}
            value={userAnswer}
            onChangeText={onAnswerChange}
            placeholder="Type your answer..."
            placeholderTextColor={Colors.textMuted}
            multiline={question.field_type === 'textarea'}
            numberOfLines={question.field_type === 'textarea' ? 4 : 1}
            selectionColor={Colors.accentStart}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  autoCard: {
    borderColor: 'rgba(0, 255, 157, 0.2)',
  },
  userCard: {
    borderColor: 'rgba(255, 215, 0, 0.2)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    justifyContent: 'space-between',
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
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
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 16,
    lineHeight: 24,
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
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  input: {
    padding: 16,
    fontSize: 15,
    color: Colors.white,
    fontWeight: '500',
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
