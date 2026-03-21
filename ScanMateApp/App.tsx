// App.tsx

import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Text, View, StyleSheet} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {NavigationContainer, NavigationContainerRef} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {useCameraPermission} from 'react-native-vision-camera';

// Import from your new file structure
import {Main} from './src/app/screens/Main';
import {ScanBoard} from './src/app/screens/ScanBoard';
import {ResultScreen} from './src/app/screens/ResultScreen';
import AnalysisScreen from './src/app/screens/Analysis';
import {ScanGame} from './src/app/screens/ScanGame';
import {GameReview} from './src/app/screens/GameReview';
import {ProfileScreen} from './src/app/screens/ProfileScreen';
import {GameLibraryScreen} from './src/app/screens/GameLibraryScreen';
import {FriendsScreen} from './src/app/screens/FriendsScreen';
import {FriendGameScreen} from './src/app/screens/FriendGameScreen';
import type {GameSnapshot} from './src/shared/types/game';
import {AuthProvider} from './src/app/context/AuthContext';
import {SocketProvider, setNavigationRef} from './src/app/context/SocketContext';

// This defines all your screens and what parameters they take
export type RootStackParamList = {
  Main: undefined;
  ScanBoard: undefined;
  ScanGame: { startingFen?: string } | undefined;
  Result: { photoPath: string };
  Analysis: { fen: string };
  GameReview: { snapshots: GameSnapshot[]; moves?: string[]; flipped?: boolean };
  Profile: undefined;
  GameLibrary: undefined;
  Friends: { challengeFen?: string } | undefined;
  FriendGame: { gameId: string };
};

// This tells the navigator to use that "map"
const Stack = createNativeStackNavigator<RootStackParamList>();

const App = () => {
  const {hasPermission, requestPermission} = useCameraPermission();
  const [isReady, setIsReady] = useState(false);

  // Check for camera permission *before* loading the app
  useEffect(() => {
    const getPermission = async () => {
      if (hasPermission) {
        setIsReady(true);
        return;
      }
      const granted = await requestPermission();
      if (!granted) {
        console.log('Permission denied');
      }
      setIsReady(true); // Ready to load, even if permission denied
    };
    getPermission();
  }, [hasPermission, requestPermission]);

  // Show a loading spinner while checking permission
  if (!isReady) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // If permission is denied, show a message and don't load the app
  if (!hasPermission) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>
          Camera permission is required to use ScanMate.
        </Text>
        <Text style={styles.text}>Please restart the app and grant permission.</Text>
      </View>
    );
  }

  // Permission is granted, load the full app navigator
  const stackScreens = (
    <>
      <Stack.Screen
        name="Main"
        component={Main}
      />
      <Stack.Screen
        name="ScanBoard"
        component={ScanBoard}
        options={{
          freezeOnBlur: false,
        }}
      />
      <Stack.Screen
        name="ScanGame"
        component={ScanGame}
      />
      <Stack.Screen
        name="Result"
        component={ResultScreen}
      />
      <Stack.Screen
        name="Analysis"
        component={AnalysisScreen}
      />
      <Stack.Screen
        name="GameReview"
        component={GameReview}
      />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
      />
      <Stack.Screen
        name="GameLibrary"
        component={GameLibraryScreen}
      />
      <Stack.Screen
        name="Friends"
        component={FriendsScreen}
      />
      <Stack.Screen
        name="FriendGame"
        component={FriendGameScreen}
      />
    </>
  );

  return (
    <AuthProvider>
      <SocketProvider>
        <GestureHandlerRootView style={styles.appRoot}>
          <NavigationContainer
            ref={(ref) => setNavigationRef(ref as NavigationContainerRef<RootStackParamList> | null)}>
            <Stack.Navigator screenOptions={{headerShown: false}}>
              {stackScreens}
            </Stack.Navigator>
          </NavigationContainer>
        </GestureHandlerRootView>
      </SocketProvider>
    </AuthProvider>
  );
};

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontSize: 18,
    textAlign: 'center',
    padding: 20,
  },
});

export default App;