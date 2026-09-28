import { useFonts } from 'expo-font';
import Constants from 'expo-constants';
import { SecureStore } from './src/storage';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  useColorScheme,
} from 'react-native';
import {
  DEFAULT_API_URL,
  FamilyOSAPI,
  readSavedAPIURL,
  saveAPIURL,
} from './src/auth-api';
import { CognitoAccounts, CognitoError } from './src/cognito';
import HouseholdApp from './src/HouseholdApp';
import DesignPreview from './src/DesignPreview';

const appConfig = Constants.expoConfig?.extra ?? {};
const COGNITO_CLIENT_ID = String(appConfig.familyosCognitoClientId ?? '');
const cognito = new CognitoAccounts(COGNITO_CLIENT_ID, String(appConfig.familyosCognitoRegion ?? 'us-west-2'));
const PENDING_HOUSEHOLD_KEY = 'familyos.pending-household';

type Screen = 'sign-in' | 'sign-up' | 'verify' | 'forgot' | 'reset' | 'account';
type Appearance = 'system' | 'light' | 'dark';
type Account = {
  accountId: string;
  email: string;
  parentName: string;
  emailVerified: boolean;
  householdId: string;
  householdName: string;
};

const APPEARANCE_KEY = 'familyos.appearance';

function palette(dark: boolean) {
  return dark
    ? {
        canvas: '#1A1714', surface: '#221E19', field: '#221E19', ink: '#F4EEE4',
        secondary: '#B8AE9F', line: '#332C25', amber: '#F2B25C', error: '#F08B75',
        success: '#78B980', message: '#2B302E',
      }
    : {
        canvas: '#F7F5F0', surface: '#FFFFFF', field: '#FFFFFF', ink: '#1F1B16',
        secondary: '#5F574B', line: '#ECE6DB', amber: '#D98D18', error: '#A83E2A',
        success: '#2F7940', message: '#F8F0DE',
      };
}

export default function App() {
  if (__DEV__ && Platform.OS === 'web' && process.env.EXPO_PUBLIC_FAMILYOS_DESIGN_PREVIEW === '1') return <DesignPreview />;
  return <AccountApp />;
}

function AccountApp() {
  const [fontsLoaded] = useFonts({
    'Figtree-400': require('./assets/fonts/Figtree-400.ttf'),
    'Figtree-500': require('../../packages/shared-ui/src/assets/fonts/Figtree-500.ttf'),
    'Figtree-600': require('./assets/fonts/Figtree-600.ttf'),
    'Figtree-700': require('./assets/fonts/Figtree-700.ttf'),
    'Figtree-800': require('../../packages/shared-ui/src/assets/fonts/Figtree-800.ttf'),
    'Bricolage-700-34': require('../../packages/shared-ui/src/assets/fonts/Bricolage-700-34.ttf'),
    'Bricolage-800-34': require('./assets/fonts/Bricolage-800-34.ttf'),
  });
  const systemScheme = useColorScheme();
  const [appearance, setAppearance] = useState<Appearance>('light');
  const dark = appearance === 'system' ? systemScheme === 'dark' : appearance === 'dark';
  const colors = useMemo(() => palette(dark), [dark]);
  const styles = useMemo(() => makeStyles(colors, dark), [colors, dark]);

  const [apiURL, setAPIURL] = useState(DEFAULT_API_URL);
  const api = useMemo(() => {
    try { return new FamilyOSAPI(apiURL); } catch { return null; }
  }, [apiURL]);
  const [email, setEmail] = useState('');
  const hostedAuth = Boolean(api?.usesCognito);
  const [screen, setScreen] = useState<Screen>('sign-in');
  const [account, setAccount] = useState<Account | null>(null);
  const [password, setPassword] = useState('');
  const [parentName, setParentName] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [localCode, setLocalCode] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [serverDraft, setServerDraft] = useState(DEFAULT_API_URL);
  const [settingsError, setSettingsError] = useState('');
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      readSavedAPIURL(),
      SecureStore.getItemAsync(APPEARANCE_KEY),
    ]).then(([savedURL, savedAppearance]) => {
      if (!active) return;
      setAPIURL(savedURL);
      setServerDraft(savedURL);
      if (savedAppearance === 'light' || savedAppearance === 'dark' || savedAppearance === 'system') {
        setAppearance(savedAppearance);
      }
      setInitialized(true);
    }).catch(() => setInitialized(true));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!initialized || !api) return;
    api.session().then((result) => {
      setAccount(result.account);
      setScreen(result.authenticated ? 'account' : 'sign-in');
    }).catch(() => setScreen('sign-in'));
  }, [api, initialized]);

  const tell = (text: string, isError = false) => {
    setMessage(text);
    setMessageIsError(isError);
  };

  const perform = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    setMessageIsError(false);
    try { await action(); }
    catch (error) {
      if (error instanceof CognitoError && error.code === 'UserNotConfirmedException') {
        setPassword(''); setCode(''); setLocalCode(null); setScreen('verify');
      }
      tell(error instanceof Error ? error.message : 'Please try again.', true);
    }
    finally { setBusy(false); }
  };

  const getLocalCode = async (address: string, purpose: 'verify_email' | 'reset_password') => {
    if (!api) return null;
    try { return (await api.localEmailCode(address.trim().toLowerCase(), purpose))?.code ?? null; }
    catch { return null; }
  };

  const createAccount = () => perform(async () => {
    if (!api) throw new Error('Set a valid FamilyOS server address in Settings first.');
    if (!parentName.trim() || !householdName.trim()) throw new Error('Enter your name and household name.');
    if (password.length < 12) throw new Error('Use a password with at least 12 characters.');
    if (api.usesCognito) {
      const result = await cognito.signUp(email, password);
      setPassword('');
      await SecureStore.setItemAsync(PENDING_HOUSEHOLD_KEY, JSON.stringify({
        email: email.trim().toLowerCase(), parentName: parentName.trim(), householdName: householdName.trim(),
      }));
      setCode(''); setLocalCode(null);
      setScreen(result.UserConfirmed ? 'sign-in' : 'verify');
      tell(result.UserConfirmed ? 'Your account is ready. Sign in to continue.' : `Enter the code sent to ${result.CodeDeliveryDetails?.Destination || email.trim()}.`);
      return;
    }
    const result = await api.signUp(email.trim(), password, parentName.trim(), householdName.trim());
    setEmail(result.email);
    setPassword('');
    setCode('');
    const localDeliveryCode = await getLocalCode(result.email, 'verify_email');
    setLocalCode(localDeliveryCode);
    setScreen('verify');
    tell(localDeliveryCode
      ? 'Use the local test code below to finish setting up ' + result.householdName + '.'
      : 'The account was created, but this local preview has no email delivery. Verification must wait until email is configured.');
  });

  const verifyEmail = () => perform(async () => {
    if (!api) throw new Error('Set a valid FamilyOS server address in Settings first.');
    if (api.usesCognito) {
      await cognito.confirm(email, code);
      setCode(''); setPassword(''); setLocalCode(null); setScreen('sign-in');
      tell('Email verified. Sign in with your password to finish setting up your household.');
      return;
    }
    const result = await api.verifyEmail(email.trim(), code);
    setAccount(result);
    setLocalCode(null);
    setScreen('account');
    tell('Email verified. Your parent account is ready.');
  });

  const resendCode = () => perform(async () => {
    if (!api) throw new Error('Set a valid FamilyOS server address in Settings first.');
    if (api.usesCognito) {
      const result = await cognito.resend(email);
      tell(`A new verification code was sent to ${result.CodeDeliveryDetails?.Destination || email.trim()}.`);
      return;
    }
    await api.resendVerification(email.trim());
    const localDeliveryCode = await getLocalCode(email, 'verify_email');
    setLocalCode(localDeliveryCode);
    tell(localDeliveryCode
      ? 'A new local test code is shown below.'
      : 'This local preview has no email delivery, so a code cannot be received on this device yet.');
  });

  const signIn = () => perform(async () => {
    if (!api) throw new Error('Set a valid FamilyOS server address in Settings first.');
    if (api.usesCognito) {
      const idToken = await cognito.signIn(email, password);
      setPassword('');
      const pending = JSON.parse(await SecureStore.getItemAsync(PENDING_HOUSEHOLD_KEY) || 'null');
      const matchingProfile = pending?.email === email.trim().toLowerCase() ? pending : null;
      const result = await api.exchangeCognitoSession(idToken, matchingProfile?.parentName || '', matchingProfile?.householdName || '');
      if (matchingProfile) await SecureStore.deleteItemAsync(PENDING_HOUSEHOLD_KEY);
      setAccount(result); setLocalCode(null); setScreen('account');
      tell('You’re signed in.');
      return;
    }
    const result = await api.signIn(email.trim(), password);
    setAccount(result);
    setPassword('');
    setScreen('account');
    tell('You’re signed in.');
  });

  const sendResetCode = () => perform(async () => {
    if (!api) throw new Error('Set a valid FamilyOS server address in Settings first.');
    if (api.usesCognito) {
      await cognito.forgotPassword(email);
      setCode(''); setNewPassword(''); setPassword(''); setLocalCode(null); setScreen('reset');
      tell('If this email has an eligible account, a password reset code has been sent.');
      return;
    }
    await api.forgotPassword(email.trim());
    setCode('');
    setNewPassword('');
    const localDeliveryCode = await getLocalCode(email, 'reset_password');
    setLocalCode(localDeliveryCode);
    setScreen('reset');
    tell(localDeliveryCode
      ? 'Use the local test code below to reset your password.'
      : 'This local preview has no email delivery, so a reset code cannot be received on this device yet.');
  });

  const resetPassword = () => perform(async () => {
    if (!api) throw new Error('Set a valid FamilyOS server address in Settings first.');
    if (newPassword.length < 12) throw new Error('Use a password with at least 12 characters.');
    if (api.usesCognito) await cognito.resetPassword(email, code, newPassword);
    else await api.resetPassword(email.trim(), code, newPassword);
    setPassword('');
    setNewPassword('');
    setLocalCode(null);
    setScreen('sign-in');
    tell('Password updated. Sign in with your new password.');
  });

  const signOut = () => perform(async () => {
    setAccount(null);
    setPassword('');
    setScreen('sign-in');
    if (!api) { tell('Signed out on this phone. The server could not be reached to revoke its session.', true); return; }
    try {
      await api.signOut();
      tell('You’ve been signed out.');
    } catch {
      tell('Signed out on this phone. The server could not be reached to revoke its session.', true);
    }
  });

  const saveSettings = () => {
    if (busy) return;
    setBusy(true);
    setSettingsError('');
    void (async () => {
      try {
        const savedURL = await saveAPIURL(serverDraft);
        await SecureStore.setItemAsync(APPEARANCE_KEY, appearance);
        setAPIURL(savedURL);
        setAccount(null);
        setScreen('sign-in');
        setSettingsOpen(false);
        tell('Settings saved. Sign in to this FamilyOS server.');
      } catch (error) {
        setSettingsError(error instanceof Error ? error.message : 'Could not save settings.');
      } finally {
        setBusy(false);
      }
    })();
  };

  const screenTitle: Record<Screen, string> = {
    'sign-in': 'Your family, together',
    'sign-up': 'Your family, together',
    verify: 'Check your email',
    forgot: 'Reset your password',
    reset: 'Choose a new password',
    account: 'Your family, together',
  };
  const screenCopy: Record<Screen, string> = {
    'sign-in': 'Sign in to keep your household connected across devices.',
    'sign-up': 'Create a parent account to start your FamilyOS household.',
    verify: 'Enter the six-digit code sent to your email address.',
    forgot: 'We’ll send a reset code to the verified email on your account.',
    reset: 'Enter your reset code, then choose a new password.',
    account: '',
  };

  if (!fontsLoaded || !initialized) {
    return <View style={[styles.loading, { backgroundColor: colors.canvas }]}><ActivityIndicator color={colors.amber} /></View>;
  }

  if (screen === 'account' && account && api) {
    return <>
      <HouseholdApp key={`${apiURL}:${account.accountId}`} api={api} account={account} dark={dark} appearance={appearance}
        onAppearance={async value => { await SecureStore.setItemAsync(APPEARANCE_KEY, value); setAppearance(value); }}
        onSignOut={signOut} onServerSettings={() => { setServerDraft(apiURL); setSettingsOpen(true); }}
        onReauthenticate={async password => (api.usesCognito ? cognito.signIn(account.email, password) : undefined)} />
      <Modal visible={settingsOpen} transparent animationType="slide" onRequestClose={() => setSettingsOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}>
          <View style={styles.settingsSheet}>
            <View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Server settings</Text><Pressable accessibilityRole="button" onPress={() => setSettingsOpen(false)}><Text style={styles.close}>Cancel</Text></Pressable></View>
            <Field label="FamilyOS server" placeholder="https://…" value={serverDraft} onChangeText={setServerDraft} keyboardType="url" autoCapitalize="none" styles={styles} colors={colors}/>
            <Text style={styles.help}>Changing servers signs you out on this phone.</Text>
            {!!settingsError && <Text style={styles.settingsError}>{settingsError}</Text>}
            <ActionButton title="Save server" busy={busy} onPress={saveSettings} styles={styles} colors={colors}/>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>;
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.canvas }]}>
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} backgroundColor={colors.canvas} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.page}>
            <View style={styles.header}>
              <View style={styles.brand}>
                <Text style={styles.brandMark}>F</Text>
                <Text style={styles.brandName}>FamilyOS</Text>
              </View>
              <Pressable onPress={() => { setServerDraft(apiURL); setSettingsError(''); setSettingsOpen(true); }} accessibilityRole="button" accessibilityLabel="Settings" style={styles.settingsButton}>
                <Text style={styles.settingsGlyph}>⚙</Text>
              </Pressable>
            </View>

            <View style={styles.panel}>
              {screen !== 'account' && <>
                <Text style={styles.title}>{screenTitle[screen]}</Text>
                <Text style={styles.subtitle}>{screenCopy[screen]}</Text>
              </>}
              {!!message && (
                <View style={[styles.message, messageIsError && styles.errorMessage]} accessibilityRole="alert">
                  <View style={[styles.messageRule, messageIsError && styles.errorRule]} />
                  <Text style={styles.messageText}>{message}</Text>
                </View>
              )}

              {(screen === 'sign-in' || screen === 'sign-up') && (
                <View style={styles.tabs}>
                  <Tab label="Sign in" selected={screen === 'sign-in'} onPress={() => { setScreen('sign-in'); setMessage(''); }} styles={styles} />
                  <Tab label="Create account" selected={screen === 'sign-up'} onPress={() => { setScreen('sign-up'); setMessage(''); }} styles={styles} />
                </View>
              )}

              {screen === 'sign-in' && <View style={styles.form}>
                <Field label="Email address" placeholder="you@example.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" autoCapitalize="none" styles={styles} colors={colors} />
                <Field label="Password" placeholder="Your password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" styles={styles} colors={colors} />
                <ActionButton title="Sign in" busy={busy} onPress={signIn} styles={styles} colors={colors} />
                {hostedAuth && <TextButton title="Verify my email" onPress={() => { setScreen('verify'); setCode(''); setPassword(''); setMessage(''); }} styles={styles} />}
                <TextButton title="Forgot password?" onPress={() => { setScreen('forgot'); setMessage(''); }} styles={styles} />
              </View>}

              {screen === 'sign-up' && <View style={styles.form}>
                <Field label="Parent or guardian name" placeholder="Your name" value={parentName} onChangeText={setParentName} autoComplete="name" styles={styles} colors={colors} />
                <Field label="Household name" placeholder="The Parkers" value={householdName} onChangeText={setHouseholdName} autoComplete="organization" styles={styles} colors={colors} />
                <Field label="Email address" placeholder="you@example.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" autoCapitalize="none" styles={styles} colors={colors} />
                <Field label="Create password" placeholder="At least 12 characters" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" styles={styles} colors={colors} />
                <Text style={styles.help}>{hostedAuth ? 'Use at least 12 characters with uppercase and lowercase letters, a number, and a symbol. We’ll email you a verification code.' : 'Use at least 12 characters. Children can be added as family profiles later; they won’t need email accounts.'}</Text>
                <ActionButton title="Create parent account" busy={busy} onPress={createAccount} styles={styles} colors={colors} />
              </View>}

              {screen === 'verify' && <View style={styles.form}>
                <Field label="Email address" placeholder="you@example.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" autoCapitalize="none" styles={styles} colors={colors} />
                <Field label="Six-digit verification code" placeholder="000000" value={code} onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} styles={styles} colors={colors} />
                <LocalCode code={localCode} styles={styles} />
                <ActionButton title="Verify email" busy={busy} onPress={verifyEmail} styles={styles} colors={colors} />
                <TextButton title="Send a new code" onPress={resendCode} styles={styles} />
                <TextButton title="Back to sign in" onPress={() => { setScreen('sign-in'); setMessage(''); }} styles={styles} />
              </View>}

              {screen === 'forgot' && <View style={styles.form}>
                <Field label="Email address" placeholder="you@example.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" autoCapitalize="none" styles={styles} colors={colors} />
                <ActionButton title="Send reset code" busy={busy} onPress={sendResetCode} styles={styles} colors={colors} />
                <TextButton title="Back to sign in" onPress={() => { setScreen('sign-in'); setMessage(''); }} styles={styles} />
              </View>}

              {screen === 'reset' && <View style={styles.form}>
                <Field label="Six-digit reset code" placeholder="000000" value={code} onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} styles={styles} colors={colors} />
                <LocalCode code={localCode} styles={styles} />
                <Field label="New password" placeholder="At least 12 characters" value={newPassword} onChangeText={setNewPassword} secureTextEntry autoComplete="new-password" styles={styles} colors={colors} />
                <ActionButton title="Save new password" busy={busy} onPress={resetPassword} styles={styles} colors={colors} />
                <TextButton title="Cancel" onPress={() => { setScreen('sign-in'); setMessage(''); }} styles={styles} />
              </View>}

              {screen === 'account' && <View style={styles.accountView}>
                <View style={styles.homeMark}><Text style={styles.homeGlyph}>⌂</Text></View>
                <Text style={styles.accountTitle}>Welcome, {account?.parentName || 'Parent'}</Text>
                <Text style={styles.household}>{account?.householdName || 'Your household'}</Text>
                <Text style={styles.address}>{account?.email}</Text>
                <View style={styles.divider} />
                <Text style={styles.help}>Your Fire TV will pair separately. You won’t need to type your password with the remote.</Text>
                <ActionButton title="Sign out" busy={busy} secondary onPress={signOut} styles={styles} colors={colors} />
              </View>}
            </View>

            <Text style={styles.footer}>{hostedAuth ? 'Your account is secured by Amazon Cognito.' : 'Local preview · account and email flows use the development API'}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal transparent animationType="slide" visible={settingsOpen} onRequestClose={() => setSettingsOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.settingsSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Settings</Text>
              <Pressable onPress={() => setSettingsOpen(false)} accessibilityRole="button"><Text style={styles.close}>Done</Text></Pressable>
            </View>
            <Text style={styles.label}>Appearance</Text>
            <View style={styles.appearanceRow}>
              {(['system', 'light', 'dark'] as Appearance[]).map((choice) => (
                <Pressable key={choice} onPress={() => { setAppearance(choice); SecureStore.setItemAsync(APPEARANCE_KEY, choice).catch(() => {}); }} style={[styles.appearanceChoice, appearance === choice && styles.appearanceSelected]}>
                  <Text style={[styles.appearanceText, appearance === choice && styles.appearanceTextSelected]}>{choice[0].toUpperCase() + choice.slice(1)}</Text>
                </Pressable>
              ))}
            </View>
            <Field label="FamilyOS server" placeholder="https://… or local address" value={serverDraft} onChangeText={setServerDraft} keyboardType="url" autoCapitalize="none" styles={styles} colors={colors} />
            <Text style={styles.help}>{Platform.OS === 'web'
              ? 'This browser preview uses temporary tab storage and connects only to a local development API.'
              : 'Use HTTPS for a hosted service. For local testing, use your computer’s private Wi-Fi address and port 8787. The API must be reachable from this phone.'}</Text>
            {!!settingsError && <Text style={styles.settingsError}>{settingsError}</Text>}
            <ActionButton title="Save settings" busy={busy} onPress={saveSettings} styles={styles} colors={colors} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Tab({ label, selected, onPress, styles: tabStyles }: { label: string; selected: boolean; onPress: () => void; styles: ReturnType<typeof makeStyles> }) {
    return <Pressable onPress={onPress} style={tabStyles.tab} accessibilityRole="tab" accessibilityState={{ selected }}>
      <Text style={[tabStyles.tabText, selected && tabStyles.tabTextSelected]}>{label}</Text>
      <View style={[tabStyles.tabLine, selected && tabStyles.tabLineSelected]} />
    </Pressable>;
  }

function Field(props: {
    label: string; placeholder: string; value: string; onChangeText: (value: string) => void;
    styles: ReturnType<typeof makeStyles>; colors: ReturnType<typeof palette>; secureTextEntry?: boolean; keyboardType?: TextInputProps['keyboardType'];
    autoComplete?: TextInputProps['autoComplete']; autoCapitalize?: TextInputProps['autoCapitalize']; maxLength?: number;
  }) {
    return <View style={props.styles.fieldWrap}>
      <Text style={props.styles.label}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={props.colors.secondary}
        style={props.styles.input}
        secureTextEntry={props.secureTextEntry}
        keyboardType={props.keyboardType || 'default'}
        autoComplete={props.autoComplete}
        autoCapitalize={props.autoCapitalize || (props.keyboardType === 'email-address' || props.keyboardType === 'number-pad' ? 'none' : 'words')}
        autoCorrect={false}
        maxLength={props.maxLength}
        accessibilityLabel={props.label}
        selectionColor={props.colors.amber}
      />
    </View>;
  }

function ActionButton({ title, onPress, busy: buttonBusy, secondary, disabled, styles: buttonStyles, colors }: {
    title: string; onPress: () => void; busy: boolean; secondary?: boolean; disabled?: boolean; styles: ReturnType<typeof makeStyles>; colors: ReturnType<typeof palette>;
  }) {
    return <Pressable onPress={onPress} disabled={buttonBusy || disabled} accessibilityRole="button" accessibilityState={{ disabled: Boolean(buttonBusy || disabled), busy: buttonBusy }} style={[buttonStyles.button, secondary && buttonStyles.secondaryButton, (buttonBusy || disabled) && buttonStyles.disabled]}>
      {buttonBusy ? <ActivityIndicator color={secondary ? colors.ink : '#FFFFFF'} /> : <Text style={[buttonStyles.buttonText, secondary && buttonStyles.secondaryButtonText]}>{title}</Text>}
    </Pressable>;
  }

function TextButton({ title, onPress, styles: textButtonStyles }: { title: string; onPress: () => void; styles: ReturnType<typeof makeStyles> }) {
    return <Pressable onPress={onPress} accessibilityRole="button" style={textButtonStyles.textButton}><Text style={textButtonStyles.textButtonText}>{title}</Text></Pressable>;
  }

function LocalCode({ code: value, styles: codeStyles }: { code: string | null; styles: ReturnType<typeof makeStyles> }) {
    if (!value) return null;
    return <View style={codeStyles.codeCard}>
      <Text style={codeStyles.label}>Local test email</Text>
      <Text style={codeStyles.codeValue}>{value}</Text>
      <Text style={codeStyles.help}>Shown only by the local development API. No email was sent.</Text>
    </View>;
  }

function makeStyles(theme: ReturnType<typeof palette>, dark: boolean) {
    return StyleSheet.create({
      safe: { flex: 1 },
      flex: { flex: 1 },
      loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
      scroll: { flexGrow: 1, paddingVertical: 24 },
      page: { width: '100%', maxWidth: 480, alignSelf: 'center', paddingHorizontal: 18 },
      header: { height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
      brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
      brandMark: { width: 30, height: 30, overflow: 'hidden', borderRadius: 7, backgroundColor: theme.amber, color: '#FFFFFF', textAlign: 'center', textAlignVertical: 'center', fontFamily: 'Figtree-700', fontSize: 17 },
      brandName: { color: theme.ink, fontFamily: 'Figtree-700', fontSize: 18 },
      settingsButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.line, borderRadius: 22, backgroundColor: theme.surface },
      settingsGlyph: { color: theme.ink, fontSize: 20 },
      panel: { borderWidth: 1, borderColor: theme.line, borderRadius: 12, padding: 22, backgroundColor: theme.surface },
      title: { color: theme.ink, fontFamily: 'Bricolage-800-34', fontSize: 32, lineHeight: 37 },
      subtitle: { color: theme.secondary, fontFamily: 'Figtree-400', fontSize: 15, lineHeight: 23, marginTop: 9, marginBottom: 20 },
      tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: theme.line, marginBottom: 19 },
      tab: { flex: 1, alignItems: 'center', justifyContent: 'space-between', minHeight: 40 },
      tabText: { color: theme.secondary, fontFamily: 'Figtree-600', fontSize: 15 },
      tabTextSelected: { color: theme.ink },
      tabLine: { width: '100%', height: 2, backgroundColor: 'transparent' },
      tabLineSelected: { backgroundColor: theme.amber },
      form: { gap: 13 },
      fieldWrap: { gap: 6 },
      label: { color: theme.ink, fontFamily: 'Figtree-600', fontSize: 14 },
      input: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: theme.line, borderRadius: 8, backgroundColor: theme.field, color: theme.ink, fontFamily: 'Figtree-400', fontSize: 16 },
      help: { color: theme.secondary, fontFamily: 'Figtree-400', fontSize: 13, lineHeight: 19 },
      button: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.ink, borderRadius: 8, backgroundColor: theme.ink, marginTop: 3, paddingHorizontal: 14 },
      buttonText: { color: dark ? '#1A1714' : '#FFFFFF', fontFamily: 'Figtree-700', fontSize: 15 },
      secondaryButton: { backgroundColor: 'transparent', borderColor: theme.line },
      secondaryButtonText: { color: theme.ink },
      disabled: { opacity: 0.6 },
      textButton: { alignSelf: 'flex-start', minHeight: 34, justifyContent: 'center' },
      textButtonText: { color: theme.ink, fontFamily: 'Figtree-600', fontSize: 14, textDecorationLine: 'underline', textDecorationColor: theme.amber },
      message: { flexDirection: 'row', alignItems: 'stretch', gap: 10, padding: 11, marginBottom: 15, borderRadius: 7, backgroundColor: theme.message },
      errorMessage: { backgroundColor: dark ? '#382823' : '#F9E8E4' },
      messageRule: { width: 3, borderRadius: 2, backgroundColor: theme.amber },
      errorRule: { backgroundColor: theme.error },
      messageText: { flex: 1, color: theme.ink, fontFamily: 'Figtree-400', fontSize: 14, lineHeight: 20 },
      address: { color: theme.secondary, fontFamily: 'Figtree-400', fontSize: 14 },
      codeCard: { gap: 6, padding: 13, borderRadius: 8, backgroundColor: theme.canvas },
      codeValue: { color: theme.ink, fontFamily: 'Figtree-700', fontSize: 24, letterSpacing: 4 },
      accountView: { gap: 13 },
      homeMark: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: theme.canvas },
      homeGlyph: { color: theme.amber, fontSize: 28, lineHeight: 32 },
      accountTitle: { color: theme.ink, fontFamily: 'Bricolage-800-34', fontSize: 27 },
      household: { color: theme.ink, fontFamily: 'Figtree-700', fontSize: 20 },
      divider: { height: 1, backgroundColor: theme.line, marginVertical: 3 },
      footer: { paddingTop: 16, color: theme.secondary, fontFamily: 'Figtree-400', fontSize: 12, lineHeight: 17, textAlign: 'center' },
      modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000055' },
      settingsSheet: { gap: 13, paddingHorizontal: 22, paddingTop: 18, paddingBottom: Platform.OS === 'ios' ? 34 : 24, borderTopLeftRadius: 14, borderTopRightRadius: 14, backgroundColor: theme.surface },
      sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
      sheetTitle: { color: theme.ink, fontFamily: 'Figtree-700', fontSize: 20 },
      close: { color: theme.ink, fontFamily: 'Figtree-600', fontSize: 15 },
      appearanceRow: { flexDirection: 'row', borderWidth: 1, borderColor: theme.line, borderRadius: 8, overflow: 'hidden' },
      appearanceChoice: { flex: 1, minHeight: 39, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: theme.line },
      appearanceSelected: { backgroundColor: theme.ink },
      appearanceText: { color: theme.ink, fontFamily: 'Figtree-600', fontSize: 14 },
      appearanceTextSelected: { color: '#FFFFFF' },
      settingsError: { color: theme.error, fontFamily: 'Figtree-400', fontSize: 13 },
    });
}
