import {Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import uuid from 'react-native-uuid';
import { API_HEADER_KEY, BASE_URL, SDK_AUTO_GEN_USER_EXTERNAL_ID_KEY, SDK_PROCESSED_TRANSACTIONS_KEY, SDK_REFERRAL_CODE_KEY, SDK_REGISTERED_USERS_KEY, SDK_USER_EXTERNAL_USER_ID_KEY } from './constants';

// Response Types
export interface ValidateReferralCodeRequest {
  code: string;
}

export interface ValidateReferralCodeResponse {
  programId: string | undefined;
}

export interface RegisterUserRequest {
  userId: string;
  name?: string;
  email?: string;
  phone?: string;
}

interface ConversionUser {
  external_user_id: string;
  name?: string;
  email?: string;
  phone?: string;
  auto_generated_external_user_id?: string;
}

interface AttributePurchaseRequest {
  product_id: string;
  transaction_id: string;
  code: string;
  platform: string;
  external_user_id?: string;
  auto_generated_external_user_id?: string;
}

class ShinaraSDK {
  private static instance: ShinaraSDK;
  private headers: HeadersInit;

  private constructor() {
    this.headers = {
      'Content-Type': 'application/json',
    };
  }

  public static getInstance(): ShinaraSDK {
    if (!ShinaraSDK.instance) {
      ShinaraSDK.instance = new ShinaraSDK();
    }
    return ShinaraSDK.instance;
  }

  public async initialize(apiKey: string): Promise<void> {
    if (Platform.OS !== 'ios') {
      throw new Error(
        'ShinaraSDK is currently only supported on iOS platforms.',
      );
    }

    this.headers = {
      ...this.headers,
      [API_HEADER_KEY]: apiKey,
    };

    try {
      await this.validateAPIKey();
    } catch (e) {
      console.error('Error initializing ShinaraSDK:', e);
      throw e;
    }
  }

  private async makeRequest(
    endpoint: string,
    method: string,
    body?: any,
  ): Promise<any> {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  private async validateAPIKey(): Promise<void> {
    try {
      const data = await this.makeRequest('/api/key/validate', 'GET');
      if (!data.app_id) {
        throw new Error('Invalid API key');
      }
    } catch (e) {
      console.error('Error verifying API key:', e);
      throw new Error('Failed to verify API key');
    }
  }

  public async validateReferralCode(
    request: ValidateReferralCodeRequest,
  ): Promise<ValidateReferralCodeResponse> {
    try {
      const data = await this.makeRequest('/api/code/validate', 'POST', {
        code: request.code,
        platform: '',
      });
      await AsyncStorage.setItem(SDK_REFERRAL_CODE_KEY, request.code);
      return {
        programId: data.campaign_id,
      };
    } catch (e) {
      console.error('Error validating referral code:', e);
      throw new Error('Failed to validate Referral Code');
    }
  }

  public async getReferralCode(): Promise<string | undefined> {
    try {
      const code = await AsyncStorage.getItem(SDK_REFERRAL_CODE_KEY);
      return code ?? undefined;
    } catch (e) {
      console.error('Error getting referral code:', e);
      throw new Error('Failed to get Referral Code');
    }
  }

  public async registerUser(request: RegisterUserRequest): Promise<void> {
    const referralCode = await AsyncStorage.getItem(SDK_REFERRAL_CODE_KEY);
    if (!referralCode) {
      console.log('No stored referral code. Skipping user registration.');
      throw new Error(
        'No stored code found. Please save a code before registering a user.',
      );
    }

    const registeredUsers = JSON.parse(
      (await AsyncStorage.getItem(SDK_REGISTERED_USERS_KEY)) || '[]',
    );
    if (registeredUsers.includes(request.userId)) {
      return; // Skip if already registered
    }

    const autoGenUserId = await AsyncStorage.getItem(
      SDK_AUTO_GEN_USER_EXTERNAL_ID_KEY,
    );

    let conversion_user: ConversionUser = {
      external_user_id: request.userId,
      name: request.name,
      email: request.email,
      phone: request.phone,
    };
    if (autoGenUserId) {
      conversion_user.auto_generated_external_user_id = autoGenUserId;
    }

    try {
      await this.makeRequest('/newuser', 'POST', {
        code: referralCode,
        platform: '',
        conversion_user: conversion_user,
      });
      await AsyncStorage.setItem(SDK_USER_EXTERNAL_USER_ID_KEY, request.userId);
      await AsyncStorage.removeItem(SDK_AUTO_GEN_USER_EXTERNAL_ID_KEY);
      registeredUsers.push(request.userId);
      await AsyncStorage.setItem(
        SDK_REGISTERED_USERS_KEY,
        JSON.stringify(registeredUsers),
      );
    } catch (e) {
      console.error('Error registering user:', e);
    }
  }

  public async attributePurchase(
    productId: string,
    transactionId: string,
  ): Promise<void> {
    try {
      const referralCode = await AsyncStorage.getItem(SDK_REFERRAL_CODE_KEY);
      if (!referralCode) {
        console.log('No stored referral code. Skipping purchase attribution.');
        throw new Error(
          'No stored code found. Please save a code before attributing a purchase.',
        );
      }

      const processedTransactions = JSON.parse(
        (await AsyncStorage.getItem(SDK_PROCESSED_TRANSACTIONS_KEY)) || '[]',
      );
      if (processedTransactions.includes(transactionId)) {
        return; // Skip if already registered
      }

      let attributePurchaseRequest: AttributePurchaseRequest = {
        product_id: productId,
        transaction_id: transactionId,
        code: referralCode,
        platform: '',
      };

      const externalUserId = await AsyncStorage.getItem(
        SDK_USER_EXTERNAL_USER_ID_KEY,
      );
      if (externalUserId) {
        attributePurchaseRequest.external_user_id = externalUserId;
      } else {
        const autoSDKGenExternalUserId: string = uuid.v4().toString();
        await AsyncStorage.setItem(
          SDK_AUTO_GEN_USER_EXTERNAL_ID_KEY,
          autoSDKGenExternalUserId,
        );
        attributePurchaseRequest.auto_generated_external_user_id =
          autoSDKGenExternalUserId;
      }

      await this.sendPurchaseEvent(attributePurchaseRequest);

      processedTransactions.push(transactionId);
      await AsyncStorage.setItem(
        SDK_PROCESSED_TRANSACTIONS_KEY,
        JSON.stringify(processedTransactions),
      );
    } catch (e) {
      console.error('Error handling purchase:', e);
    }
  }

  private async sendPurchaseEvent(
    attributePurchaseRequest: AttributePurchaseRequest,
  ): Promise<void> {
    try {
      await this.makeRequest('/iappurchase', 'POST', attributePurchaseRequest);
    } catch (e) {
      console.error('Error sending purchase event:', e);
    }
  }
}

export default ShinaraSDK.getInstance();
