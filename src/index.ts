import {Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import uuid from 'react-native-uuid';
import { API_HEADER_KEY, BASE_URL, REFERRAL_PARAM_KEY, SDK_AUTO_GEN_USER_EXTERNAL_ID_KEY, SDK_PLATFORM_HEADER_KEY, SDK_PROCESSED_TRANSACTIONS_KEY, SDK_REFERRAL_BRAND_CODE_ID_KEY, SDK_REFERRAL_BRAND_CODE_IS_FREE_KEY, SDK_REFERRAL_BRAND_CODE_PLACEMENT_ID_KEY, SDK_REFERRAL_CODE_ID_KEY, SDK_REFERRAL_CODE_KEY, SDK_REFERRAL_PROGRAM_ID_KEY, SDK_REGISTERED_USERS_KEY, SDK_SETUP_COMPLETED_KEY, SDK_USER_EXTERNAL_USER_ID_KEY } from './constants';
import { getTrackingSessionData } from './util';

// Response Types

export interface KeyValidationResponse {
  app_id: string;
  track_retention?: boolean;
}

export interface ValidateReferralCodeRequest {
  code: string;
}

export interface ValidateReferralCodeResponse {
  programId: string | undefined;
  brand_code: ValidateReferralBrandCodeData | undefined;
}

export interface ValidateReferralBrandCodeData {
  code_id: string;
  is_free: boolean;
  placement_id?: string;
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
      await this.validateAPIKey();
      this.triggerSetup();
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

  private async triggerSetup(): Promise<void> {
    const sdkSetupCompleted = await AsyncStorage.getItem(SDK_SETUP_COMPLETED_KEY);
    if (sdkSetupCompleted && sdkSetupCompleted === 'true') {
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
    } finally {
      // store auto gen external user id
      await AsyncStorage.setItem(SDK_SETUP_COMPLETED_KEY, 'true');
    }
  }

  public async validateReferralCode(
    request: ValidateReferralCodeRequest,
  ): Promise<ValidateReferralCodeResponse> {
    try {
      let data = await this.makeRequest('/api/code/validate', 'POST', {
        code: request.code,
        platform: '',
      });
      const cachedAutoSDKGenExternalUserId = await AsyncStorage.getItem(SDK_AUTO_GEN_USER_EXTERNAL_ID_KEY);
      if (cachedAutoSDKGenExternalUserId) {
        data.auto_generated_external_user_id = cachedAutoSDKGenExternalUserId;
      }
      if (data.brand_code_data !== undefined) {
        // set brand code data
        await AsyncStorage.setItem(SDK_REFERRAL_BRAND_CODE_ID_KEY, data.brand_code_data.code_id);
        if (data.brand_code_data.is_free) {
          await AsyncStorage.setItem(SDK_REFERRAL_BRAND_CODE_IS_FREE_KEY, 'true');
        } else if (data.brand_code_data.placement_id) {
          await AsyncStorage.setItem(SDK_REFERRAL_BRAND_CODE_PLACEMENT_ID_KEY, data.brand_code_data.placement_id);
        }
        // clear affiliate code data
        AsyncStorage.removeItem(SDK_REFERRAL_CODE_KEY);
        AsyncStorage.removeItem(SDK_REFERRAL_PROGRAM_ID_KEY);
        AsyncStorage.removeItem(SDK_REFERRAL_CODE_ID_KEY);
        // return
        return {
          programId: undefined,
          brand_code: data.brand_code_data,
        }
      }

      if (data.campaign_id === undefined) {
        throw new Error('Invalid Referral Code');
      }

      // add affiliate code data
      await AsyncStorage.setItem(SDK_REFERRAL_CODE_KEY, request.code);
      await AsyncStorage.setItem(SDK_REFERRAL_PROGRAM_ID_KEY, data.campaign_id);
      if (data.affiliate_code_id) {
        await AsyncStorage.setItem(SDK_REFERRAL_CODE_ID_KEY, data.affiliate_code_id);
      }
      // clear brand code data
      AsyncStorage.removeItem(SDK_REFERRAL_BRAND_CODE_ID_KEY);
      AsyncStorage.removeItem(SDK_REFERRAL_BRAND_CODE_IS_FREE_KEY);
      AsyncStorage.removeItem(SDK_REFERRAL_BRAND_CODE_PLACEMENT_ID_KEY);
      // return
      return {
        programId: data.campaign_id,
        brand_code: undefined,
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

  public async getPromoCodeIsFree(): Promise<boolean | undefined> {
    try {
      const brandCodeIsFree = await AsyncStorage.getItem(SDK_REFERRAL_BRAND_CODE_IS_FREE_KEY);
      return brandCodeIsFree === 'true' ? true : undefined;
    } catch (e) {
      console.error('Error getting brand code is free:', e);
      throw new Error('Failed to get brand code is free');
    }
  }

  public async getPromoCodePlacementId(): Promise<string | undefined> {
    try {
      const brandCodePlacementId = await AsyncStorage.getItem(SDK_REFERRAL_BRAND_CODE_PLACEMENT_ID_KEY);
      return brandCodePlacementId ?? undefined;
    } catch (e) {
      console.error('Error getting brand code placement id:', e);
      throw new Error('Failed to get brand code placement id');
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
      }

      const autoGenUserIdData = await AsyncStorage.getItem(SDK_AUTO_GEN_USER_EXTERNAL_ID_KEY);
      if (autoGenUserIdData) {
        attributePurchaseRequest.auto_generated_external_user_id = autoGenUserIdData;
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
