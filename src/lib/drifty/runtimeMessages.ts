export type LegacyRuntimeSuccess<T> = {
  success: true;
  data: T;
};

export type LegacyRuntimeFailure = {
  success: false;
  error: string;
};

export type LegacyRuntimeResponse<T> = LegacyRuntimeSuccess<T> | LegacyRuntimeFailure;

export type DriftyRuntimeMessageMap = {
  GET_TODAY_STATS: { request: { type: 'GET_TODAY_STATS' }; response: unknown };
  GET_WEEKLY_STATS: { request: { type: 'GET_WEEKLY_STATS' }; response: unknown };
  GET_DATE_STATS: { request: { type: 'GET_DATE_STATS'; date: string }; response: unknown };
  GET_CURRENT_SESSION: { request: { type: 'GET_CURRENT_SESSION' }; response: unknown };
  GET_POPUP_DATA: { request: { type: 'GET_POPUP_DATA' }; response: unknown };
  GET_SETTINGS: { request: { type: 'GET_SETTINGS' }; response: unknown };
  GET_CATEGORIES: { request: { type: 'GET_CATEGORIES' }; response: unknown };
};

export type DriftyRuntimeMessageType = keyof DriftyRuntimeMessageMap;
export type DriftyRuntimeRequest<TType extends DriftyRuntimeMessageType> = DriftyRuntimeMessageMap[TType]['request'];
export type DriftyRuntimeData<TType extends DriftyRuntimeMessageType> = DriftyRuntimeMessageMap[TType]['response'];

function normalizeRuntimeResponse<T>(response: LegacyRuntimeResponse<T> | undefined): LegacyRuntimeResponse<T> {
  if (!response) {
    return { success: false, error: 'Chrome runtime returned no response' };
  }

  return response;
}

export function sendDriftyRuntimeMessage<TType extends DriftyRuntimeMessageType>(
  message: DriftyRuntimeRequest<TType>
): Promise<LegacyRuntimeResponse<DriftyRuntimeData<TType>>> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    return Promise.resolve({ success: false, error: 'Chrome runtime messaging is unavailable' });
  }

  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response: LegacyRuntimeResponse<DriftyRuntimeData<TType>> | undefined) => {
      const lastError = chrome.runtime.lastError;
      if (lastError?.message) {
        resolve({ success: false, error: lastError.message });
        return;
      }

      resolve(normalizeRuntimeResponse(response));
    });
  });
}

export async function requestDriftyRuntimeData<TType extends DriftyRuntimeMessageType>(
  message: DriftyRuntimeRequest<TType>
): Promise<DriftyRuntimeData<TType>> {
  const response = await sendDriftyRuntimeMessage(message);

  if (!response.success) {
    throw new Error(response.error);
  }

  return response.data;
}
