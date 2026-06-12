/**
 * App Store Connect API response shapes.
 *
 * Only V1 endpoints are typed here. Add more as we wire each feature.
 *
 * Reference: https://developer.apple.com/documentation/appstoreconnectapi
 *
 * Convention:
 *  - Each top-level shape mirrors what the API returns (no field renames)
 *  - We never throw away fields — `[k: string]: unknown` in attributes for
 *    future-compat. Only fields we actually use are statically typed.
 */

export type ASCApiResponse<T> = {
  data: T;
  links?: { self: string; next?: string };
  meta?: { paging?: { total: number; limit: number } };
  included?: ASCResource[];
};

export type ASCResource = {
  type: string;
  id: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<
    string,
    { data?: { type: string; id: string } | { type: string; id: string }[] | null }
  >;
};

// ----------------------------- /v1/apps ------------------------------------

export type ASCApp = {
  type: 'apps';
  id: string;
  attributes: {
    name: string;
    bundleId: string;
    sku: string;
    primaryLocale: string;
    isOrEverWasMadeForKids?: boolean;
    contentRightsDeclaration?: string;
    subscriptionStatusUrl?: string;
    subscriptionStatusUrlVersion?: string;
  };
};

export type ListAppsResponse = ASCApiResponse<ASCApp[]>;

// ----------------------------- /v1/users/me --------------------------------
// Helpful (optionally) for grabbing the human-readable team name. Not all
// keys have permission to call this; we degrade gracefully if it 403s.

export type ASCUser = {
  type: 'users';
  id: string;
  attributes: {
    firstName?: string;
    lastName?: string;
    username?: string;
    roles?: string[];
  };
};

// ------------------- /v1/apps/{id}/appStoreVersions ------------------------

/**
 * Apple's `AppStoreVersion` resource.
 *
 * `appStoreState` is the raw string we feed into `toSemanticState`.
 * `createdDate` is when the version draft was opened; we use it as a
 * floor when the API doesn't give us state-change timestamps (it almost
 * never does for older versions).
 */
export type ASCAppStoreVersion = {
  type: 'appStoreVersions';
  id: string;
  attributes: {
    versionString: string;          // e.g. "1.8.23"
    appStoreState?: string;         // e.g. "READY_FOR_SALE"
    platform?: string;              // e.g. "IOS"
    releaseType?: string;           // e.g. "MANUAL" | "AFTER_APPROVAL" | "SCHEDULED"
    earliestReleaseDate?: string;   // ISO 8601, for scheduled releases
    downloadable?: boolean;
    createdDate?: string;           // ISO 8601
  };
  relationships?: {
    build?:                      { data?: { type: 'builds'; id: string } | null };
    appStoreVersionSubmission?:  { data?: { type: 'appStoreVersionSubmissions'; id: string } | null };
  };
};

export type ASCBuild = {
  type: 'builds';
  id: string;
  attributes: {
    version?: string;            // build number, e.g. "29"
    uploadedDate?: string;       // ISO 8601
    expirationDate?: string;
    processingState?: string;    // "PROCESSING" | "FAILED" | "INVALID" | "VALID"
    minOsVersion?: string;
    iconAssetToken?: { templateUrl?: string };
  };
};

export type ASCAppStoreVersionSubmission = {
  type: 'appStoreVersionSubmissions';
  id: string;
};

export type ListAppStoreVersionsResponse = ASCApiResponse<ASCAppStoreVersion[]>;

// ---------------- /v1/apps/{id}/customerReviews ----------------------------

/**
 * App Store customer reviews.
 *
 * Note on permissions: the customerReviews collection requires the API
 * key to have at least "Customer Support" or "Admin" role. Keys with
 * lower roles (e.g. "Developer") return 403 here. We surface that as a
 * friendly empty state.
 */
export type ASCCustomerReview = {
  type: 'customerReviews';
  id: string;
  attributes: {
    rating?: number;                 // 1–5
    title?: string;
    body?: string;
    reviewerNickname?: string;
    createdDate?: string;            // ISO 8601
    territory?: string;              // ISO 3166-1 alpha-3 country code
  };
  relationships?: {
    response?: { data?: { type: 'customerReviewResponses'; id: string } | null };
  };
};

export type ASCCustomerReviewResponse = {
  type: 'customerReviewResponses';
  id: string;
  attributes: {
    responseBody?: string;
    lastModifiedDate?: string;
    state?: 'PUBLISHED' | 'PENDING_PUBLISH';
  };
  relationships?: {
    review?: { data?: { type: 'customerReviews'; id: string } | null };
  };
};

export type ListCustomerReviewsResponse = ASCApiResponse<ASCCustomerReview[]>;

// ---------------- /v1/appStoreVersions/{id}/appStoreVersionLocalizations ----

/**
 * Per-locale metadata for a version (description, keywords, support URL, etc).
 *
 * This is where MOST mechanical rejections come from — Apple rejects when
 * fields are blank, too long, or contain disallowed URLs/promotional copy.
 */
export type ASCAppStoreVersionLocalization = {
  type: 'appStoreVersionLocalizations';
  id: string;
  attributes: {
    locale?: string;             // e.g. "en-US"
    description?: string;
    keywords?: string;           // comma-separated, ≤ 100 chars total
    marketingUrl?: string;
    promotionalText?: string;    // ≤ 170 chars
    supportUrl?: string;
    whatsNew?: string;           // release notes
  };
};

export type ListVersionLocalizationsResponse = ASCApiResponse<ASCAppStoreVersionLocalization[]>;

// ---------------- /v1/appStoreVersionLocalizations/{id}/appScreenshotSets ---

export type ASCAppScreenshotSet = {
  type: 'appScreenshotSets';
  id: string;
  attributes: {
    /**
     * Apple's display-target enum (e.g. "APP_IPHONE_67" for 6.7"
     * iPhones — required for every submission). Full list:
     * https://developer.apple.com/documentation/appstoreconnectapi/screenshotdisplaytype
     */
    screenshotDisplayType?: string;
  };
};

export type ListScreenshotSetsResponse = ASCApiResponse<ASCAppScreenshotSet[]>;

// ----------------------------- /v1/apps/{id}/appInfos ---------------------
//
// `AppInfo` is the *app-level* metadata bundle — category, content rights,
// age rating, etc. These survive across version submissions, but each one
// has a `state` machine just like AppStoreVersion (`PREPARE_FOR_SUBMISSION`
// is the editable one; `READY_FOR_DISTRIBUTION` is the currently-live one).
//
// Privacy-policy URL is on `AppInfoLocalization`, NOT on AppInfo itself.

export type ASCAppInfo = {
  type: 'appInfos';
  id: string;
  attributes: {
    /** e.g. PREPARE_FOR_SUBMISSION (editable) | READY_FOR_DISTRIBUTION (live) */
    state?: string;
  };
  relationships?: {
    primaryCategory?: { data?: { type: 'appCategories'; id: string } | null };
    secondaryCategory?: { data?: { type: 'appCategories'; id: string } | null };
    appInfoLocalizations?: { data?: { type: 'appInfoLocalizations'; id: string }[] };
  };
};

export type ListAppInfosResponse = ASCApiResponse<ASCAppInfo[]>;

export type ASCAppCategory = {
  type: 'appCategories';
  id: string; // e.g. "PRODUCTIVITY" | "UTILITIES" | "DEVELOPER_TOOLS"
};

export type ASCAppInfoLocalization = {
  type: 'appInfoLocalizations';
  id: string;
  attributes: {
    locale?: string;
    name?: string;
    subtitle?: string;
    privacyPolicyUrl?: string;
    privacyChoicesUrl?: string;
    privacyPolicyText?: string;
  };
};

export type ListAppInfoLocalizationsResponse = ASCApiResponse<ASCAppInfoLocalization[]>;

// ----------------------------- /v1/apps/{id}/subscriptionGroups -----------
//
// Used by the Checklist rule that warns when any subscription product is
// still in MISSING_METADATA (Apple won't approve the binary with it).

export type ASCSubscriptionGroup = {
  type: 'subscriptionGroups';
  id: string;
  attributes: {
    referenceName?: string;
  };
  relationships?: {
    subscriptions?: { data?: { type: 'subscriptions'; id: string }[] };
  };
};

export type ASCSubscription = {
  type: 'subscriptions';
  id: string;
  attributes: {
    name?: string;            // human-readable reference name
    productId?: string;       // e.g. "release_pilot_pro_monthly"
    /**
     * One of:
     *  MISSING_METADATA  - missing availability / price / localization / screenshot
     *  READY_TO_SUBMIT   - all required fields filled
     *  WAITING_FOR_REVIEW, IN_REVIEW
     *  APPROVED          - approved by Apple
     *  REJECTED          - rejected by Apple
     *  DEVELOPER_REMOVED_FROM_SALE
     */
    state?: string;
  };
};

export type ListSubscriptionGroupsResponse = ASCApiResponse<ASCSubscriptionGroup[]>;
