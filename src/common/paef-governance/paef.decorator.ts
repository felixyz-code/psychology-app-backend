import { SetMetadata } from '@nestjs/common';
import { EffectClass } from './paef.types';

export const PAEF_EFFECT_CLASS_KEY = 'paef_effect_class';
export const PAEF_TARGET_SCOPE_KEY = 'paef_target_scope';

/**
 * Decorator to require PAEF Governance Authority Gate evaluation on a route.
 *
 * @param effectClass Effect classification (e.g. EffectClass.AUTHORITY_SENSITIVE for clinical diagnostics)
 * @param targetScope The governed domain/scope identifier (e.g. 'clinical:session-note-diagnosis')
 */
export const RequireAuthority = (
  effectClass: EffectClass,
  targetScope: string
) => {
  return (target: object, key?: string | symbol, descriptor?: TypedPropertyDescriptor<any>) => {
    SetMetadata(PAEF_EFFECT_CLASS_KEY, effectClass)(target, key!, descriptor!);
    SetMetadata(PAEF_TARGET_SCOPE_KEY, targetScope)(target, key!, descriptor!);
  };
};
