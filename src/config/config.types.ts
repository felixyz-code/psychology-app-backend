export type NodeEnvironment = 'development' | 'test' | 'production';

export type RuntimeConfig = {
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  port: number;
  nodeEnv: NodeEnvironment;
  uploadsPath: string;
  corsOrigins: string[];
  swaggerEnabled: boolean;
};
