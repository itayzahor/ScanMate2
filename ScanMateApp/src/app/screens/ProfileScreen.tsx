import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet, Image, Alert} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../../App';
import {useAuth} from '../context/AuthContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>;

export const ProfileScreen = ({navigation}: Props) => {
  const {user, signOut} = useAuth();

  const onSignOutPress = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          navigation.popToTop();
        },
      },
    ]);
  };

  if (!user) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>Not signed in</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Back button */}
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      {/* User info */}
      <View style={styles.profileHeader}>
        {user.picture ? (
          <Image source={{uri: user.picture}} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarLetter}>{user.name?.charAt(0) ?? '?'}</Text>
          </View>
        )}
        <Text style={styles.userName}>{user.name}</Text>
        <Text style={styles.userEmail}>{user.email}</Text>
      </View>

      {/* Menu items */}
      <View style={styles.menu}>
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => navigation.navigate('GameLibrary')}
          activeOpacity={0.8}
        >
          <Text style={styles.menuIcon}>📚</Text>
          <View style={styles.menuTextWrapper}>
            <Text style={styles.menuTitle}>Game Library</Text>
            <Text style={styles.menuSubtitle}>Saved games and positions</Text>
          </View>
          <Text style={styles.menuChevron}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => navigation.navigate('Friends')}
          activeOpacity={0.8}
        >
          <Text style={styles.menuIcon}>👥</Text>
          <View style={styles.menuTextWrapper}>
            <Text style={styles.menuTitle}>Friends</Text>
            <Text style={styles.menuSubtitle}>Manage friends and requests</Text>
          </View>
          <Text style={styles.menuChevron}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Sign out */}
      <TouchableOpacity style={styles.signOutButton} onPress={onSignOutPress} activeOpacity={0.8}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0c111d',
    paddingHorizontal: 24,
    paddingTop: 48,
  },
  backButton: {
    marginBottom: 24,
  },
  backText: {
    color: '#91a0c7',
    fontSize: 16,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 40,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 16,
  },
  avatarPlaceholder: {
    backgroundColor: '#1c2b4b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: {
    color: '#f5f7ff',
    fontSize: 32,
    fontWeight: '700',
  },
  userName: {
    color: '#f5f7ff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  userEmail: {
    color: '#91a0c7',
    fontSize: 14,
  },
  menu: {
    gap: 12,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderRadius: 16,
    backgroundColor: '#141b2d',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  menuIcon: {
    fontSize: 24,
    marginRight: 14,
  },
  menuTextWrapper: {
    flex: 1,
  },
  menuTitle: {
    color: '#f5f7ff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  menuSubtitle: {
    color: '#8b98c7',
    fontSize: 13,
  },
  menuChevron: {
    color: '#8b98c7',
    fontSize: 24,
    fontWeight: '300',
  },
  signOutButton: {
    marginTop: 'auto',
    marginBottom: 40,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,70,70,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,70,70,0.2)',
    alignItems: 'center',
  },
  signOutText: {
    color: '#ff5252',
    fontSize: 15,
    fontWeight: '600',
  },
  emptyText: {
    color: '#91a0c7',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 100,
  },
});
