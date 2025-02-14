import {Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import uuid from 'react-native-uuid';
import { API_HEADER_KEY, BASE_URL, REFERRAL_PARAM_KEY, SDK_AUTO_GEN_USER_EXTERNAL_ID_KEY, SDK_PLATFORM_HEADER_KEY, SDK_PROCESSED_TRANSACTIONS_KEY, SDK_REFERRAL_CODE_ID_KEY, SDK_REFERRAL_CODE_KEY, SDK_REFERRAL_PROGRAM_ID_KEY, SDK_REGISTERED_USERS_KEY, SDK_SETUP_COMPLETED_KEY, SDK_USER_EXTERNAL_USER_ID_KEY } from './constants';
import { getTrackingSessionData } from './util';

// Response Types

export interface KeyValidationResponse {
  app_id: string;
  track_retention?: boolean;
}


export interface TriggerAppOpenRequest {
  affiliate_code_id: string;
  external_user_id?: string;
  auto_generated_external_user_id?: string;
}

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
  token?: string;
  external_user_id?: string;
  auto_generated_external_user_id?: string;
  affiliate_code_id?: string;
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
    this.headers = {
      ...this.headers,
      [API_HEADER_KEY]: apiKey,
      [SDK_PLATFORM_HEADER_KEY]: Platform.OS,
    };
    try {
      const keyValidationResponse = await this.validateAPIKey();
      this.triggerSetup();
      if (keyValidationResponse.track_retention && keyValidationResponse.track_retention === true) {
        this.triggerAppOpen();
      }
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

  private async validateAPIKey(): Promise<KeyValidationResponse> {
    try {
      const data = await this.makeRequest('/api/key/validate', 'GET');
      if (!data.app_id) {
        throw new Error('Invalid API key');
      }
      return data;
    } catch (e) {
      console.error('Error verifying API key:', e);
      throw new Error('Failed to verify API key');
    }
  }

  public async handleDeepLink(url: string): Promise<void> {
    const urlObject = new URL(url);
    const queryItems = new URLSearchParams(urlObject.search);
    for (const item of queryItems) {
      if (item?.length > 1 && item[0] === REFERRAL_PARAM_KEY && item[1]) {
        try {
          await this.validateReferralCode({ code: item[1] });
        } catch (e) {
          console.error('Error handling deep link:', e);
        }
        return;
      }
    }
  }

  private async triggerSetup(): Promise<void> {
    const sdkSetupCompleted = await AsyncStorage.getItem(SDK_SETUP_COMPLETED_KEY);
    if (sdkSetupCompleted) {
      // skip since already setup
      return;
    }

    let autoSDKGenExternalUserId: string = uuid.v4().toString();
    const cachedAutoSDKGenExternalUserId = await AsyncStorage.getItem(SDK_AUTO_GEN_USER_EXTERNAL_ID_KEY);
    if (cachedAutoSDKGenExternalUserId) {
      autoSDKGenExternalUserId = cachedAutoSDKGenExternalUserId;
    } else {
      await AsyncStorage.setItem(SDK_AUTO_GEN_USER_EXTERNAL_ID_KEY, autoSDKGenExternalUserId);
    }


    // TODO: Send backend request
    try {
      const trackingPayload = await getTrackingSessionData(autoSDKGenExternalUserId);
      await this.makeRequest('/sdknewtrackingsession', 'POST', trackingPayload);
      await AsyncStorage.setItem(SDK_SETUP_COMPLETED_KEY, 'true');
    } catch (e) {
      console.error('Error triggering app open:', e);
      if (e instanceof Error && e.message.startsWith('HTTP error! status:')) {
        // retriable error
      } else {
        // store auto gen external user id and don't retry
        await AsyncStorage.setItem(SDK_SETUP_COMPLETED_KEY, 'true');
      }
    }
  }

  private async triggerAppOpen(): Promise<void> {
    const referralCodeId = await AsyncStorage.getItem(SDK_REFERRAL_CODE_ID_KEY);
    if (!referralCodeId) {
      return;
    }

    const externalUserId = await AsyncStorage.getItem(SDK_USER_EXTERNAL_USER_ID_KEY);
    const autoGeneratedExternalUserId = await AsyncStorage.getItem(SDK_AUTO_GEN_USER_EXTERNAL_ID_KEY);

    const request: TriggerAppOpenRequest = {
      affiliate_code_id: referralCodeId,
      external_user_id: externalUserId ? externalUserId : undefined,
      auto_generated_external_user_id: autoGeneratedExternalUserId ? autoGeneratedExternalUserId : undefined,
    };

    try {
      await this.makeRequest('/appopen', 'POST', request);
    } catch (e) {
      console.error('Error triggering app open:', e);
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
      if (data.campaign_id === undefined) {
        throw new Error('Invalid Referral Code');
      }
      await AsyncStorage.setItem(SDK_REFERRAL_CODE_KEY, request.code);
      await AsyncStorage.setItem(SDK_REFERRAL_PROGRAM_ID_KEY, data.campaign_id);
      if (data.affiliate_code_id) {
        await AsyncStorage.setItem(SDK_REFERRAL_CODE_ID_KEY, data.affiliate_code_id);
      }
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

  public async getProgramId(): Promise<string | undefined> {
    try {
      const programId = await AsyncStorage.getItem(SDK_REFERRAL_PROGRAM_ID_KEY);
      return programId ?? undefined;
    } catch (e) {
      console.error('Error getting program id:', e);
      throw new Error('Failed to get program id');
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

    const autoGenUserIdData = await AsyncStorage.getItem(SDK_AUTO_GEN_USER_EXTERNAL_ID_KEY);
    const autoGenUserId = autoGenUserIdData ? autoGenUserIdData : undefined;

    const codeIdData = await AsyncStorage.getItem(
      SDK_REFERRAL_CODE_ID_KEY,
    );
    const codeId = codeIdData ? codeIdData : undefined;

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
        affiliate_code_id: codeId,
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

  public async getUserId(): Promise<string | undefined> {
    try {
      const userId = await AsyncStorage.getItem(SDK_USER_EXTERNAL_USER_ID_KEY);
      return userId ?? undefined;
    } catch (e) {
      console.error('Error getting user id:', e);
      throw new Error('Failed to get user id');
    }
  }

  public async attributePurchase(
    productId: string,
    transactionId: string,
    token?: string,
  ): Promise<void> {
    try {
      if (Platform.OS === 'android' && !token) {
        throw new Error('Attribute purchase token is required on Android');
      }

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
        token: token,
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

      const codeId = await AsyncStorage.getItem(SDK_REFERRAL_CODE_ID_KEY);
      if (codeId) {
        attributePurchaseRequest.affiliate_code_id = codeId;
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
