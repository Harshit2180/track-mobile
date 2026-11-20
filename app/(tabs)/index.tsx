
import { memo, useMemo } from 'react';
import {
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';

import { useTrack } from '../../src/data/EngineProvider';
import { formatINR } from '../../src/core/money';
import { formatDayIST, monthLabel, monthKeyIST } from '../../src/core/time';
import { categoryLabel } from '../../src/core/labels';
import type { Txn } from '../../src/core/types';

const Row = memo(function Row({ t }: { t: Txn }) {
  const foreign = t.currency !== 'INR';

  const sign = t.isOwnTransfer
    ? ''
    : t.direction === 'credit' ? '+' : '-';

  const color = t.isOwnTransfer
    ? '#888'
    : t.direction === 'credit' ? '#1a7f37' : '#111';

  const amount = foreign
    ? `${t.currency} ${(t.amountMinor / 100).toFixed(2)}`
    : formatINR(t.amountMinor);

  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: '/transaction/[id]',
          params: { id: t.id },
        })
      }
      accessibilityRole="button"
      style={s.row}
    >
      <View style={{ flex: 1 }}>
        <Text style={s.merchant} numberOfLines={1}>
          {t.merchantDisplay}
        </Text>

        <Text style={s.sub} numberOfLines={1}>
          {formatDayIST(t.ts)} ·{' '}
          {t.isOwnTransfer
            ? 'Own account transfer'
            : categoryLabel(t.category)}
          {t.status === 'PENDING' ? ' · Pending' : ''}
        </Text>
      </View>

      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[s.amount, { color }]}>
          {sign}{amount}
        </Text>

        {foreign && t.inrMinor !== null && (
          <Text style={s.sub}>{formatINR(t.inrMinor)}</Text>
        )}
      </View>
    </Pressable>
  );
});

export default function TrackScreen() {
  const { transactions, months, state, refresh } = useTrack();

  const sections = useMemo(() => {
    const totals = new Map(months.map((m) => [m.month, m]));
    const by = new Map<string, Txn[]>();

    for (const t of transactions) {
      const key = monthKeyIST(t.ts);
      if (!by.has(key)) by.set(key, []);
      by.get(key)!.push(t);
    }

    return [...by.entries()].map(([key, data]) => ({
      key,
      totals: totals.get(key),
      data,
    }));
  }, [transactions, months]);

  return (
    <View style={s.screen}>
      {state.lastError && (
        <Text style={s.banner}>
          Couldn't refresh. Showing saved data. Pull down to retry.
        </Text>
      )}

      <SectionList
        sections={sections}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => <Row t={item} />}

        renderSectionHeader={({ section }) => (
          <View style={s.header}>
            <Text style={s.headerTitle}>
              {monthLabel(section.key)}
            </Text>

            <Text style={s.headerSub}>
              Spent {formatINR(section.totals?.spendMinor ?? 0)}
              {'   '}
              Earned {formatINR(section.totals?.incomeMinor ?? 0)}
            </Text>
          </View>
        )}

        stickySectionHeadersEnabled
        initialNumToRender={20}
        windowSize={7}
        refreshControl={
          <RefreshControl
            refreshing={state.syncing}
            onRefresh={refresh}
          />
        }
        ListEmptyComponent={
          <Text style={s.empty}>
            {state.syncing
              ? 'Loading your transactions…'
              : 'No transactions yet'}
          </Text>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 48,
  },
  banner: {
    backgroundColor: '#fff3cd',
    padding: 8,
    textAlign: 'center',
  },
  header: {
    backgroundColor: '#fafafa',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
  },
  headerTitle: {
    fontWeight: '700',
    fontSize: 16,
  },
  headerSub: {
    color: '#555',
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
    minHeight: 56,
  },
  merchant: {
    fontSize: 15,
    fontWeight: '500',
  },
  sub: {
    color: '#777',
    fontSize: 12,
    marginTop: 2,
  },
  amount: {
    fontSize: 15,
    fontWeight: '600',
  },
  empty: {
    textAlign: 'center',
    marginTop: 40,
    color: '#777',
  },
});
