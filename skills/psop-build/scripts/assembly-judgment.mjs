/** Shared virtual-assembly policy. A rigid observation never proves physical impossibility. */
import {createHash} from 'node:crypto';
import {INTERFACE_CONTACT_METHOD} from './interface-contact.mjs';

export const ASSEMBLY_POLICY_SCHEMA='psop.assembly-policy/1';
export const DEFAULT_ASSEMBLY_POLICY=Object.freeze({schema:ASSEMBLY_POLICY_SCHEMA,version:1,minor_contact_volume_mm3:.01,unrelated_obstacle_depth_m:.0001});
export function assemblyPolicy(input=DEFAULT_ASSEMBLY_POLICY){
  if(input.schema!==ASSEMBLY_POLICY_SCHEMA||input.version!==1)throw Error('Unsupported assembly policy');
  const value={...DEFAULT_ASSEMBLY_POLICY,...input};
  for(const key of ['minor_contact_volume_mm3','unrelated_obstacle_depth_m'])if(!Number.isFinite(value[key])||value[key]<0)throw Error('Invalid assembly policy threshold: '+key);
  return Object.fromEntries(Object.keys(DEFAULT_ASSEMBLY_POLICY).map(k=>[k,value[k]]));
}
export const policyDigest=input=>createHash('sha256').update(JSON.stringify(assemblyPolicy(input))).digest('hex');
export const mechanicsNotEvaluated=Object.freeze({status:'not_evaluated',scope:'strain_stress_retention_and_load'});

/** Classifies one pair. Only independently established invalidity or a new deep unrelated obstacle blocks. */
export function assessAssembly({observation={status:'not_evaluated'},policy=DEFAULT_ASSEMBLY_POLICY,configuration_ref=null,reference=false,expected_contact=false,mechanism=null,independent_block=null,baseline=null}={}){
  policy=assemblyPolicy(policy);
  const reasons=[];let decision='allow';
  const contact=observation.diagnostics?.interface_contact,invalidContact=contact?.method===INTERFACE_CONTACT_METHOD&&contact.status==='sampled'&&contact.regions?.length&&contact.witnesses?.some(w=>Number.isFinite(w.depth_m)&&Number.isFinite(w.outside_contact_distance_m)&&w.depth_m>policy.unrelated_obstacle_depth_m&&w.outside_contact_distance_m>policy.unrelated_obstacle_depth_m);
  if(independent_block){decision='block';reasons.push(independent_block);}
  else if(!reference&&expected_contact&&observation.status==='interference'&&invalidContact){decision='block';reasons.push('penetration_outside_interface_contact_region');}
  else if(observation.status!=='clear'){
    decision='allow_with_note';
    if(reference)reasons.push('published_reference_configuration');
    else if(expected_contact)reasons.push(mechanism?'qualified_interface_contact':'interface_trial');
    else {
      const depth=observation.diagnostics?.sampled_penetration_depth_m;
      const previous=baseline?.diagnostics?.sampled_penetration_depth_m;
      // Missing depth/baseline is not silently converted into a collision proof.
      if(observation.status==='interference'&&Number.isFinite(depth)&&depth>policy.unrelated_obstacle_depth_m&&
        (baseline?.status==='clear'||Number.isFinite(previous)&&depth>previous+policy.unrelated_obstacle_depth_m)){
        decision='block';reasons.push('new_or_worsened_unrelated_obstacle');
      }else reasons.push(observation.status==='interference'?'overlap_observed_without_independent_obstacle_proof':'geometry_not_evaluated');
    }
    if(expected_contact&&observation.intersection_volume_m3*1e9<=policy.minor_contact_volume_mm3)reasons.push('minor_contact_display_filter');
  }
  return {schema:'psop.assembly-assessment/1',decision,reasons,configuration_ref,policy_digest:policyDigest(policy),mechanism,mechanics:mechanicsNotEvaluated};
}
