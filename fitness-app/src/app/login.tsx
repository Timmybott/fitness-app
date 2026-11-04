import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Chip } from '@/components/chip';
import { ErrorNotice, PrimaryButton } from '@/components/list';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';

export default function LoginScreen() {
  const { signIn, signUp } = useAuth();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const register = mode === 'register';
  const valid = email.includes('@') && password.length >= 8 && (!register || name.trim().length > 0);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (register) await signUp(name.trim(), email.trim(), password);
      else await signIn(email.trim(), password);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.flex}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.six }]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <View style={styles.logo}>
            <SymbolView name="figure.strengthtraining.traditional" size={44} tintColor={Colors.onAccent} />
          </View>
          <AppText type="largeTitle">Fitness</AppText>
          <AppText color={Colors.textSecondary}>Ernährung und Training an einem Ort.</AppText>
        </View>

        <View style={styles.switch}>
          <Chip label="Anmelden" active={!register} onPress={() => setMode('login')} />
          <Chip label="Registrieren" active={register} onPress={() => setMode('register')} />
        </View>

        <View style={styles.fields}>
          {register && (
            <Field value={name} onChangeText={setName} placeholder="Name" textContentType="givenName" autoComplete="name" />
          )}
          <Field
            value={email}
            onChangeText={setEmail}
            placeholder="E-Mail"
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            autoCapitalize="none"
          />
          <Field
            value={password}
            onChangeText={setPassword}
            placeholder={register ? 'Passwort (min. 8 Zeichen)' : 'Passwort'}
            secureTextEntry
            textContentType={register ? 'newPassword' : 'password'}
            autoComplete={register ? 'new-password' : 'current-password'}
            onSubmitEditing={valid ? submit : undefined}
          />
        </View>

        {error && <ErrorNotice message={error} />}
        <PrimaryButton title={register ? 'Account erstellen' : 'Anmelden'} onPress={submit} disabled={!valid} loading={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field(props: React.ComponentProps<typeof TextInput>) {
  return <TextInput placeholderTextColor={Colors.textTertiary} autoCorrect={false} style={styles.input} {...props} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.four, gap: Spacing.four },
  hero: { alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.three },
  logo: {
    width: 88,
    height: 88,
    borderRadius: 24,
    borderCurve: 'continuous',
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  switch: { flexDirection: 'row', gap: Spacing.two, justifyContent: 'center' },
  fields: { gap: Spacing.two },
  input: {
    backgroundColor: Colors.card,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    paddingHorizontal: Spacing.three,
    height: 52,
    color: Colors.text,
    fontSize: 17,
  },
});
