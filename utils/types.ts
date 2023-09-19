export enum Operation {
  Grant,
  Revoke,
  GrantWithCondition,
}

/**
 * Represents a testing fork configuration.
 *
 * @network The name of the forked network.
 * @osxVersion The version of OSx at the moment of the fork.
 */
export type TestingFork = {
  network: string;
  osxVersion: string;
};

export type Permission = {
  operation: Operation;
  where: {name: string; address: string};
  who: {name: string; address: string};
  permission: string;
  condition?: string;
  data?: string;
};

export type AragonVerifyEntry = {
  address: string;
  args?: any[];
};

export type AragonPluginRepos = {
  'address-list-voting': string;
  'token-voting': string;
  // prettier-ignore
  'admin': string;
  // prettier-ignore
  'multisig': string;
  // prettier-ignore
  'vocdoni': string;
  [index: string]: string;
};

// release, build
export type VersionTag = [number, number];

export type UpdateInfo = {
  tags: string | string[];
  forkBlockNumber: number;
};

export const UPDATE_INFOS: {[index: string]: UpdateInfo} = {
  v1_3_0: {
    tags: 'update/to_v1.3.0',
    forkBlockNumber: 16722881,
  },
};
