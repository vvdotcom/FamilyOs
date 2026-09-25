import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import DrawerNavigator from './DrawerNavigator';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="DrawerNavigator" component={DrawerNavigator} />
    </Stack.Navigator>
  );
}
