import fogPixelShader from './fog_ps.wgsl?raw';
import cloudVertexShader from './cloud/cloud_vs.wgsl?raw';
import cloudPixelShader from './cloud/cloud_ps.wgsl?raw';
import bigCloudPixelShader from './cloud/big_cloud_ps.wgsl?raw';
import bigCloudBgPixelShader from './cloud/big_cloud_bg_ps.wgsl?raw';
import polarLightPixelShader from './polar_light_ps.wgsl?raw';

export {
    fogPixelShader, cloudVertexShader, cloudPixelShader, bigCloudPixelShader, bigCloudBgPixelShader,
    polarLightPixelShader,
};
