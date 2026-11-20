import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTrack } from '../../src/data/EngineProvider';
import { formatForeign, formatINR } from '../../src/core/money';
import { formatDateTimeIST } from '../../src/core/time';
import { categoryLabel } from '../../src/core/labels';

export default function TransactionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { transactions } = useTrack();
  const t = transactions.find((x) => x.id === id);
  if (!t) return <Text style={{ padding: 24 }}>This transaction is no longer available.</Text>;
  const foreign = t.currency !== 'INR';
  const rows: [string, string][] = [
    ['Amount', foreign ? formatForeign(t.amountMinor, t.currency) : formatINR(t.amountMinor)],
    ...(foreign && t.inrMinor !== null ? [['In rupees', formatINR(t.inrMinor)] as [string, string]] : []),
    ['Type', t.isOwnTransfer ? 'Transfer between your own accounts' : t.direction === 'credit' ? 'Money in' : 'Money out'],
    ['Date (IST)', formatDateTimeIST(t.ts)],
    ['Status', t.status === 'PENDING' ? 'Pending' : 'Posted'],
    ['Category', categoryLabel(t.category)],
    ['Account', t.accountId.replace('acc_', '••••')],
    ['Bank description', t.merchant],
    ['Transaction ID', t.id],
  ];
  return (
    <ScrollView contentContainerStyle={{ padding: 20 }}>
      <Stack.Screen options={{ title: t.merchantDisplay }} />
      {rows.map(([k, v]) => (
        <View key={k} style={s.row}>
          <Text style={s.k}>{k}</Text>
          <Text style={s.v} selectable>{v}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  row: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ddd' },
  k: { color: '#777', fontSize: 12 },
  v: { fontSize: 16, marginTop: 2 },
});