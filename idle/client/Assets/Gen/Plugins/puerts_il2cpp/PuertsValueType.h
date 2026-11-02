// Auto Gen

#if !__SNC__
#ifndef __has_feature 
#define __has_feature(x) 0 
#endif
#endif

#if _MSC_VER
typedef wchar_t Il2CppChar;
#elif __has_feature(cxx_unicode_literals)
typedef char16_t Il2CppChar;
#else
typedef uint16_t Il2CppChar;
#endif

namespace puerts
{

// StreamingContextStates
struct i4
{
    int32_t p0;
};
    
// StreamingContext
struct S_Oi4_
{
    Il2CppObject* p0;
    int32_t p1;
};
    
// RuntimeTypeHandle
struct S_p_
{
    void* p0;
};
    
// NativeOverlapped
struct S_ppi4i4p_
{
    void* p0;
    void* p1;
    int32_t p2;
    int32_t p3;
    void* p4;
};
    
// ProcessingMode
struct u1
{
    uint8_t p0;
};
    
// DateTime
struct S_u8_
{
    uint64_t p0;
};
    
// Guid
struct S_i4i2i2u1u1u1u1u1u1u1u1_
{
    int32_t p0;
    int16_t p1;
    int16_t p2;
    uint8_t p3;
    uint8_t p4;
    uint8_t p5;
    uint8_t p6;
    uint8_t p7;
    uint8_t p8;
    uint8_t p9;
    uint8_t p10;
};
    
// ProfilerRecorderSample
struct S_i8i8i8_
{
    int64_t p0;
    int64_t p1;
    int64_t p2;
};
    
// T
struct S__
{
    union
    {
        struct
        {
        };
        uint8_t __padding[1];
    };
};
    
// Vector2
struct S_r4r4_
{
    float p0;
    float p1;
};
    
// VertexAttributeDescriptor
struct S_i4i4i4i4_
{
    int32_t p0;
    int32_t p1;
    int32_t p2;
    int32_t p3;
};
    
// Vector3
struct S_r4r4r4_
{
    float p0;
    float p1;
    float p2;
};
    
// Vector4
struct S_r4r4r4r4_
{
    float p0;
    float p1;
    float p2;
    float p3;
};
    
// Color32
struct S_i4u1u1u1u1_
{
    int32_t p0;
    uint8_t p1;
    uint8_t p2;
    uint8_t p3;
    uint8_t p4;
};
    
// Bounds
struct S_S_r4r4r4_S_r4r4r4__
{
    struct S_r4r4r4_ p0;
    struct S_r4r4r4_ p1;
};
    
// SubMeshDescriptor
struct S_S_S_r4r4r4_S_r4r4r4__i4i4i4i4i4i4_
{
    struct S_S_r4r4r4_S_r4r4r4__ p0;
    int32_t p1;
    int32_t p2;
    int32_t p3;
    int32_t p4;
    int32_t p5;
    int32_t p6;
};
    
// MeshLodRange
struct S_u4u4_
{
    uint32_t p0;
    uint32_t p1;
};
    
// Matrix4x4
struct S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_
{
    float p0;
    float p1;
    float p2;
    float p3;
    float p4;
    float p5;
    float p6;
    float p7;
    float p8;
    float p9;
    float p10;
    float p11;
    float p12;
    float p13;
    float p14;
    float p15;
};
    
// BoneWeight
struct S_r4r4r4r4i4i4i4i4_
{
    float p0;
    float p1;
    float p2;
    float p3;
    int32_t p4;
    int32_t p5;
    int32_t p6;
    int32_t p7;
};
    
// SphericalHarmonicsL2
struct S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_
{
    float p0;
    float p1;
    float p2;
    float p3;
    float p4;
    float p5;
    float p6;
    float p7;
    float p8;
    float p9;
    float p10;
    float p11;
    float p12;
    float p13;
    float p14;
    float p15;
    float p16;
    float p17;
    float p18;
    float p19;
    float p20;
    float p21;
    float p22;
    float p23;
    float p24;
    float p25;
    float p26;
};
    
// ReflectionProbeBlendInfo
struct S_or4_
{
    Il2CppObject* p0;
    float p1;
};
    
// AsyncGPUReadbackRequest
struct S_pi4_
{
    void* p0;
    int32_t p1;
};
    
// CullingGroupEvent
struct S_i4u1u1_
{
    int32_t p0;
    uint8_t p1;
    uint8_t p2;
};
    
// CustomRenderTextureUpdateZone
struct S_S_r4r4r4_S_r4r4r4_r4i4b_
{
    struct S_r4r4r4_ p0;
    struct S_r4r4r4_ p1;
    float p2;
    int32_t p3;
    bool p4;
};
    
// AwaitableAndFrameIndex
struct S_oi4_
{
    Il2CppObject* p0;
    int32_t p1;
};
    
// TimeSpan
struct S_i8_
{
    int64_t p0;
};
    
// PhraseRecognizedEventArgs
struct S_i4osS_u8_S_i8__
{
    int32_t p0;
    Il2CppObject* p1;
    Il2CppString* p2;
    struct S_u8_ p3;
    struct S_i8_ p4;
};
    
// PhotoCaptureResult
struct S_i4i8_
{
    int32_t p0;
    int64_t p1;
};
    
// PlayableGraph
struct S_pu4_
{
    void* p0;
    uint32_t p1;
};
    
// ShaderVariant
struct S_oS_u4u4_o_
{
    Il2CppObject* p0;
    struct S_u4u4_ p1;
    Il2CppObject* p2;
};
    
// RenderTargetBlendState
struct S_u1u1u1u1u1u1u1u1_
{
    uint8_t p0;
    uint8_t p1;
    uint8_t p2;
    uint8_t p3;
    uint8_t p4;
    uint8_t p5;
    uint8_t p6;
    uint8_t p7;
};
    
// BlendState
struct S_S_u1u1u1u1u1u1u1u1_S_u1u1u1u1u1u1u1u1_S_u1u1u1u1u1u1u1u1_S_u1u1u1u1u1u1u1u1_S_u1u1u1u1u1u1u1u1_S_u1u1u1u1u1u1u1u1_S_u1u1u1u1u1u1u1u1_S_u1u1u1u1u1u1u1u1_u1u1i2_
{
    struct S_u1u1u1u1u1u1u1u1_ p0;
    struct S_u1u1u1u1u1u1u1u1_ p1;
    struct S_u1u1u1u1u1u1u1u1_ p2;
    struct S_u1u1u1u1u1u1u1u1_ p3;
    struct S_u1u1u1u1u1u1u1u1_ p4;
    struct S_u1u1u1u1u1u1u1u1_ p5;
    struct S_u1u1u1u1u1u1u1u1_ p6;
    struct S_u1u1u1u1u1u1u1u1_ p7;
    uint8_t p8;
    uint8_t p9;
    int16_t p10;
};
    
// RasterState
struct S_i4i4r4u1u1u1u1_
{
    int32_t p0;
    int32_t p1;
    float p2;
    uint8_t p3;
    uint8_t p4;
    uint8_t p5;
    uint8_t p6;
};
    
// DepthState
struct S_u1i1_
{
    uint8_t p0;
    int8_t p1;
};
    
// StencilState
struct S_u1u1u1u1u1u1u1u1u1u1u1u1_
{
    uint8_t p0;
    uint8_t p1;
    uint8_t p2;
    uint8_t p3;
    uint8_t p4;
    uint8_t p5;
    uint8_t p6;
    uint8_t p7;
    uint8_t p8;
    uint8_t p9;
    uint8_t p10;
    uint8_t p11;
};
    
// RenderStateBlock
struct S_S_S_u1u1u1u1u1u1u1u1_S_u1u1u1u1u1u1u1u1_S_u1u1u1u1u1u1u1u1_S_u1u1u1u1u1u1u1u1_S_u1u1u1u1u1u1u1u1_S_u1u1u1u1u1u1u1u1_S_u1u1u1u1u1u1u1u1_S_u1u1u1u1u1u1u1u1_u1u1i2_S_i4i4r4u1u1u1u1_S_u1i1_S_u1u1u1u1u1u1u1u1u1u1u1u1_i4i4_
{
    struct S_S_u1u1u1u1u1u1u1u1_S_u1u1u1u1u1u1u1u1_S_u1u1u1u1u1u1u1u1_S_u1u1u1u1u1u1u1u1_S_u1u1u1u1u1u1u1u1_S_u1u1u1u1u1u1u1u1_S_u1u1u1u1u1u1u1u1_S_u1u1u1u1u1u1u1u1_u1u1i2_ p0;
    struct S_i4i4r4u1u1u1u1_ p1;
    struct S_u1i1_ p2;
    struct S_u1u1u1u1u1u1u1u1u1u1u1u1_ p3;
    int32_t p4;
    int32_t p5;
};
    
// GraphicsState
struct S_oooS_S_S_u1u1u1u1u1u1u1u1_S_u1u1u1u1u1u1u1u1_S_u1u1u1u1u1u1u1u1_S_u1u1u1u1u1u1u1u1_S_u1u1u1u1u1u1u1u1_S_u1u1u1u1u1u1u1u1_S_u1u1u1u1u1u1u1u1_S_u1u1u1u1u1u1u1u1_u1u1i2_S_i4i4r4u1u1u1u1_S_u1i1_S_u1u1u1u1u1u1u1u1u1u1u1u1_i4i4_i4i4i4i4i4r4r4i4i4i4i4i4bbbbb_
{
    Il2CppObject* p0;
    Il2CppObject* p1;
    Il2CppObject* p2;
    struct S_S_S_u1u1u1u1u1u1u1u1_S_u1u1u1u1u1u1u1u1_S_u1u1u1u1u1u1u1u1_S_u1u1u1u1u1u1u1u1_S_u1u1u1u1u1u1u1u1_S_u1u1u1u1u1u1u1u1_S_u1u1u1u1u1u1u1u1_S_u1u1u1u1u1u1u1u1_u1u1i2_S_i4i4r4u1u1u1u1_S_u1i1_S_u1u1u1u1u1u1u1u1u1u1u1u1_i4i4_ p3;
    int32_t p4;
    int32_t p5;
    int32_t p6;
    int32_t p7;
    int32_t p8;
    float p9;
    float p10;
    int32_t p11;
    int32_t p12;
    int32_t p13;
    int32_t p14;
    int32_t p15;
    bool p16;
    bool p17;
    bool p18;
    bool p19;
    bool p20;
};
    
// AtomicSafetyHandle
struct S_pi4i4_
{
    void* p0;
    int32_t p1;
    int32_t p2;
};
    
// NativeArray`1
struct S_Pvi4i4i4S_pi4i4_i4_
{
    void* p0;
    int32_t p1;
    int32_t p2;
    int32_t p3;
    struct S_pi4i4_ p4;
    int32_t p5;
};
    
// LODParameters
struct S_i4S_r4r4r4_r4r4i4_
{
    int32_t p0;
    struct S_r4r4r4_ p1;
    float p2;
    float p3;
    int32_t p4;
};
    
// BatchCullingContext
struct S_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_i4S_r4r4r4_r4r4i4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_i4i4i4S_u8_u4u8u2u1i4i4p_
{
    struct S_Pvi4i4i4S_pi4i4_i4_ p0;
    struct S_Pvi4i4i4S_pi4i4_i4_ p1;
    struct S_i4S_r4r4r4_r4r4i4_ p2;
    struct S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_ p3;
    int32_t p4;
    int32_t p5;
    int32_t p6;
    struct S_u8_ p7;
    uint32_t p8;
    uint64_t p9;
    uint16_t p10;
    uint8_t p11;
    int32_t p12;
    int32_t p13;
    void* p14;
};
    
// BatchCullingOutput
struct S_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4__
{
    struct S_Pvi4i4i4S_pi4i4_i4_ p0;
    struct S_Pvi4i4i4S_pi4i4_i4_ p1;
};
    
// RendererList
struct S_pu4u4u4u4_
{
    void* p0;
    uint32_t p1;
    uint32_t p2;
    uint32_t p3;
    uint32_t p4;
};
    
// PropertyPathPart
struct S_i4si4O_
{
    int32_t p0;
    Il2CppString* p1;
    int32_t p2;
    Il2CppObject* p3;
};
    
// UIVertex
struct S_S_r4r4r4_S_r4r4r4_S_r4r4r4r4_S_i4u1u1u1u1_S_r4r4r4r4_S_r4r4r4r4_S_r4r4r4r4_S_r4r4r4r4_S_r4r4r4r4__
{
    struct S_r4r4r4_ p0;
    struct S_r4r4r4_ p1;
    struct S_r4r4r4r4_ p2;
    struct S_i4u1u1u1u1_ p3;
    struct S_r4r4r4r4_ p4;
    struct S_r4r4r4r4_ p5;
    struct S_r4r4r4r4_ p6;
    struct S_r4r4r4r4_ p7;
    struct S_r4r4r4r4_ p8;
};
    
// UICharInfo
struct S_S_r4r4_r4_
{
    struct S_r4r4_ p0;
    float p1;
};
    
// UILineInfo
struct S_i4i4r4r4_
{
    int32_t p0;
    int32_t p1;
    float p2;
    float p3;
};
    
// GlyphMetrics
struct S_r4r4r4r4r4_
{
    float p0;
    float p1;
    float p2;
    float p3;
    float p4;
};
    
// MultipleSubstitutionRecord
struct S_u4o_
{
    uint32_t p0;
    Il2CppObject* p1;
};
    
// LigatureSubstitutionRecord
struct S_ou4_
{
    Il2CppObject* p0;
    uint32_t p1;
};
    
// GlyphAdjustmentRecord
struct S_u4S_r4r4r4r4__
{
    uint32_t p0;
    struct S_r4r4r4r4_ p1;
};
    
// GlyphPairAdjustmentRecord
struct S_S_u4S_r4r4r4r4__S_u4S_r4r4r4r4__i4_
{
    struct S_u4S_r4r4r4r4__ p0;
    struct S_u4S_r4r4r4r4__ p1;
    int32_t p2;
};
    
// MarkToBaseAdjustmentRecord
struct S_u4S_r4r4_u4S_r4r4__
{
    uint32_t p0;
    struct S_r4r4_ p1;
    uint32_t p2;
    struct S_r4r4_ p3;
};
    
// FontAssetCreationEditorSettings
struct S_si4i4r4i4i4i4i4i4i4sssi4r4i4b_
{
    Il2CppString* p0;
    int32_t p1;
    int32_t p2;
    float p3;
    int32_t p4;
    int32_t p5;
    int32_t p6;
    int32_t p7;
    int32_t p8;
    int32_t p9;
    Il2CppString* p10;
    Il2CppString* p11;
    Il2CppString* p12;
    int32_t p13;
    float p14;
    int32_t p15;
    bool p16;
};
    
// FontFaceHandle
struct S_i8i4i4_
{
    int64_t p0;
    int32_t p1;
    int32_t p2;
};
    
// FaceInfo
struct S_i4ssr4r4i4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_
{
    int32_t p0;
    Il2CppString* p1;
    Il2CppString* p2;
    float p3;
    float p4;
    int32_t p5;
    float p6;
    float p7;
    float p8;
    float p9;
    float p10;
    float p11;
    float p12;
    float p13;
    float p14;
    float p15;
    float p16;
    float p17;
    float p18;
    float p19;
    float p20;
};
    
// FontReferenceMap
struct S_oo_
{
    Il2CppObject* p0;
    Il2CppObject* p1;
};
    
// HierarchyNodeFlags
struct u4
{
    uint32_t p0;
};
    
// HierarchyNode
struct S_i4i4_
{
    int32_t p0;
    int32_t p1;
};
    
// ContactPoint
struct S_S_r4r4r4_S_r4r4r4_S_r4r4r4_S_u8_S_u8_r4_
{
    struct S_r4r4r4_ p0;
    struct S_r4r4r4_ p1;
    struct S_r4r4r4_ p2;
    struct S_u8_ p3;
    struct S_u8_ p4;
    float p5;
};
    
// AnimatorClipInfo
struct S_S_u8_r4_
{
    struct S_u8_ p0;
    float p1;
};
    
// BMPAlloc
struct S_i4u2u1u1_
{
    int32_t p0;
    uint16_t p1;
    uint8_t p2;
    uint8_t p3;
};
    
// TextureId
struct S_i4_
{
    int32_t p0;
};
    
// FilterParameter
struct S_i4r4S_r4r4r4r4__
{
    int32_t p0;
    float p1;
    struct S_r4r4r4r4_ p2;
};
    
// FixedBuffer4`1
struct S_S_i4r4S_r4r4r4r4__S_i4r4S_r4r4r4r4__S_i4r4S_r4r4r4r4__S_i4r4S_r4r4r4r4___
{
    struct S_i4r4S_r4r4r4r4__ p0;
    struct S_i4r4S_r4r4r4r4__ p1;
    struct S_i4r4S_r4r4r4r4__ p2;
    struct S_i4r4S_r4r4r4r4__ p3;
};
    
// FilterFunction
struct S_i4S_S_i4r4S_r4r4r4r4__S_i4r4S_r4r4r4r4__S_i4r4S_r4r4r4r4__S_i4r4S_r4r4r4r4___i4o_
{
    int32_t p0;
    struct S_S_i4r4S_r4r4r4r4__S_i4r4S_r4r4r4r4__S_i4r4S_r4r4r4r4__S_i4r4S_r4r4r4r4___ p1;
    int32_t p2;
    Il2CppObject* p3;
};
    
// FilterPassContext
struct S_S_i4S_S_i4r4S_r4r4r4r4__S_i4r4S_r4r4r4r4__S_i4r4S_r4r4r4r4__S_i4r4S_r4r4r4r4___i4o_i4bbr4_
{
    struct S_i4S_S_i4r4S_r4r4r4r4__S_i4r4S_r4r4r4r4__S_i4r4S_r4r4r4r4__S_i4r4S_r4r4r4r4___i4o_ p0;
    int32_t p1;
    bool p2;
    bool p3;
    float p4;
};
    
// Page
struct S_S_Pvi4i4i4S_pi4i4_i4_i4_
{
    struct S_Pvi4i4i4S_pi4i4_i4_ p0;
    int32_t p1;
};
    
// NativeSlice`1
struct S_Pvi4i4i4i4S_pi4i4__
{
    void* p0;
    int32_t p1;
    int32_t p2;
    int32_t p3;
    int32_t p4;
    struct S_pi4i4_ p5;
};
    
// FillGradient
struct S_oi4i4S_r4r4_S_r4r4_S_r4r4_S_r4r4_r4_
{
    Il2CppObject* p0;
    int32_t p1;
    int32_t p2;
    struct S_r4r4_ p3;
    struct S_r4r4_ p4;
    struct S_r4r4_ p5;
    struct S_r4r4_ p6;
    float p7;
};
    
// EntryType
struct u2
{
    uint16_t p0;
};
    
// UnmanagedMaterialPropertyValue
struct S_i4i4S_r4r4r4r4_S_u8__
{
    int32_t p0;
    int32_t p1;
    struct S_r4r4r4r4_ p2;
    struct S_u8_ p3;
};
    
// MaterialPropertyValue
struct S_si4S_r4r4r4r4_o_
{
    Il2CppString* p0;
    int32_t p1;
    struct S_r4r4r4r4_ p2;
    Il2CppObject* p3;
};
    
// UnsafeMeshGenerationNode
struct S_S_p__
{
    struct S_p_ p0;
};
    
// Painter2DJobData
struct S_S_S_p__i4ppi4_
{
    struct S_S_p__ p0;
    int32_t p1;
    void* p2;
    void* p3;
    int32_t p4;
};
    
// GlyphsEnumerable
struct S_i4ooo_
{
    int32_t p0;
    Il2CppObject* p1;
    Il2CppObject* p2;
    Il2CppObject* p3;
};
    
// Nullable`1
struct N_bS_S_r4r4r4_S_r4r4r4___
{
    bool hasValue;
    struct S_S_r4r4r4_S_r4r4r4__ p1;
};
    
// StyleClassList
struct S_o_
{
    Il2CppObject* p0;
};
    
// UnmanagedDataStore
struct S_S_pi4_Pv_
{
    struct S_pi4_ p0;
    void* p1;
};
    
// LayoutDataAccess
struct S_i4S_S_pi4_Pv_S_S_pi4_Pv__
{
    int32_t p0;
    struct S_S_pi4_Pv_ p1;
    struct S_S_pi4_Pv_ p2;
};
    
// LayoutNode
struct S_S_i4S_S_pi4_Pv_S_S_pi4_Pv__S_i4i4__
{
    struct S_i4S_S_pi4_Pv_S_S_pi4_Pv__ p0;
    struct S_i4i4_ p1;
};
    
// PanelClearSettings
struct S_bbS_r4r4r4r4__
{
    bool p0;
    bool p1;
    struct S_r4r4r4r4_ p2;
};
    
// PropertyPath
struct S_S_i4si4O_S_i4si4O_S_i4si4O_S_i4si4O_oi4_
{
    struct S_i4si4O_ p0;
    struct S_i4si4O_ p1;
    struct S_i4si4O_ p2;
    struct S_i4si4O_ p3;
    Il2CppObject* p4;
    int32_t p5;
};
    
// BindingId
struct S_S_S_i4si4O_S_i4si4O_S_i4si4O_S_i4si4O_oi4_s_
{
    struct S_S_i4si4O_S_i4si4O_S_i4si4O_S_i4si4O_oi4_ p0;
    Il2CppString* p1;
};
    
// BindingTarget
struct S_oS_S_S_i4si4O_S_i4si4O_S_i4si4O_S_i4si4O_oi4_s__
{
    Il2CppObject* p0;
    struct S_S_S_i4si4O_S_i4si4O_S_i4si4O_S_i4si4O_oi4_s_ p1;
};
    
// DataSourceContext
struct S_OS_S_i4si4O_S_i4si4O_S_i4si4O_S_i4si4O_oi4__
{
    Il2CppObject* p0;
    struct S_S_i4si4O_S_i4si4O_S_i4si4O_S_i4si4O_oi4_ p1;
};
    
// BindingResult
struct S_i4s_
{
    int32_t p0;
    Il2CppString* p1;
};
    
// Nullable`1
struct N_bS_i4s__
{
    bool hasValue;
    struct S_i4s_ p1;
};
    
// BindablePropertyChangedEventArgs
struct S_S_S_S_i4si4O_S_i4si4O_S_i4si4O_S_i4si4O_oi4_s__
{
    struct S_S_S_i4si4O_S_i4si4O_S_i4si4O_S_i4si4O_oi4_s_ p0;
};
    
// ChangesFromUI
struct S_i8oo_
{
    int64_t p0;
    Il2CppObject* p1;
    Il2CppObject* p2;
};
    
// TimerState
struct S_i8i8_
{
    int64_t p0;
    int64_t p1;
};
    
// UsingEntry
struct S_sso_
{
    Il2CppString* p0;
    Il2CppString* p1;
    Il2CppObject* p2;
};
    
// TimeValue
struct S_r4i4_
{
    float p0;
    int32_t p1;
};
    
// AttributeOverride
struct S_soss_
{
    Il2CppString* p0;
    Il2CppObject* p1;
    Il2CppString* p2;
    Il2CppString* p3;
};
    
// UxmlSerializedDataOverride
struct S_i4oo_
{
    int32_t p0;
    Il2CppObject* p1;
    Il2CppObject* p2;
};
    
// SlotUsageEntry
struct S_si4_
{
    Il2CppString* p0;
    int32_t p1;
};
    
// SerializedDataOverrideRange
struct S_oi4o_
{
    Il2CppObject* p0;
    int32_t p1;
    Il2CppObject* p2;
};
    
// UxmlNamespaceDefinition
struct S_ss_
{
    Il2CppString* p0;
    Il2CppString* p1;
};
    
// LazyLoadReference`1
struct S_S_u8__
{
    struct S_u8_ p0;
};
    
// AssetEntry
struct S_ssS_S_u8__S_u8_o_
{
    Il2CppString* p0;
    Il2CppString* p1;
    struct S_S_u8__ p2;
    struct S_u8_ p3;
    Il2CppObject* p4;
};
    
// NativeTextBuffer
struct S_S_Pvi4i4i4S_pi4i4_i4_i4i4_
{
    struct S_Pvi4i4i4S_pi4i4_i4_ p0;
    int32_t p1;
    int32_t p2;
};
    
// TextureInfo
struct S_obi4_
{
    Il2CppObject* p0;
    bool p1;
    int32_t p2;
};
    
// MeshGenerationNode
struct S_S_S_p__S_pi4i4__
{
    struct S_S_p__ p0;
    struct S_pi4i4_ p1;
};
    
// NativeTextInfo
struct S_pi4i4i4bb_
{
    void* p0;
    int32_t p1;
    int32_t p2;
    int32_t p3;
    bool p4;
    bool p5;
};
    
// RawSlice
struct S_Pvi4i4S_pi4i4__
{
    void* p0;
    int32_t p1;
    int32_t p2;
    struct S_pi4i4_ p3;
};
    
// MeshModificationContext
struct S_ooi4oo_
{
    Il2CppObject* p0;
    Il2CppObject* p1;
    int32_t p2;
    Il2CppObject* p3;
    Il2CppObject* p4;
};
    
// MeshModifierRegistration
struct S_obi4i8_
{
    Il2CppObject* p0;
    bool p1;
    int32_t p2;
    int64_t p3;
};
    
// JobHandle
struct S_u8i4i4p_
{
    uint64_t p0;
    int32_t p1;
    int32_t p2;
    void* p3;
};
    
// ElementInsertionData
struct S_ob_
{
    Il2CppObject* p0;
    bool p1;
};
    
// DepthOrderedDirtyTracking
struct S_ooooou4_
{
    Il2CppObject* p0;
    Il2CppObject* p1;
    Il2CppObject* p2;
    Il2CppObject* p3;
    Il2CppObject* p4;
    uint32_t p5;
};
    
// Alloc
struct S_u4u4Ob_
{
    uint32_t p0;
    uint32_t p1;
    Il2CppObject* p2;
    bool p3;
};
    
// KeyValuePair`2
struct S_so_
{
    Il2CppString* p0;
    Il2CppObject* p1;
};
    
// SerializedCommand
struct S_u1u1ppi4i4i4i4pS_r4r4r4r4_S_r4r4r4r4_p_
{
    uint8_t p0;
    uint8_t p1;
    void* p2;
    void* p3;
    int32_t p4;
    int32_t p5;
    int32_t p6;
    int32_t p7;
    void* p8;
    struct S_r4r4r4r4_ p9;
    struct S_r4r4r4r4_ p10;
    void* p11;
};
    
// Page
struct S_u2u2i4_
{
    uint16_t p0;
    uint16_t p1;
    int32_t p2;
};
    
// StyleVariable
struct S_i4i4oo_
{
    int32_t p0;
    int32_t p1;
    Il2CppObject* p2;
    Il2CppObject* p3;
};
    
// StyleValueManaged
struct S_i4i4O_
{
    int32_t p0;
    int32_t p1;
    Il2CppObject* p2;
};
    
// BackgroundPosition
struct S_i4S_r4i4__
{
    int32_t p0;
    struct S_r4i4_ p1;
};
    
// StyleValue
struct S_i4i4r4S_r4i4_S_r4r4r4r4_S_i4S_r4i4__S_i4i4__
{
    int32_t p0;
    int32_t p1;
    float p2;
    struct S_r4i4_ p3;
    struct S_r4r4r4r4_ p4;
    struct S_i4S_r4i4__ p5;
    struct S_i4i4_ p6;
};
    
// BindingInfo
struct S_oS_S_S_i4si4O_S_i4si4O_S_i4si4O_S_i4si4O_oi4_s_o_
{
    Il2CppObject* p0;
    struct S_S_S_i4si4O_S_i4si4O_S_i4si4O_S_i4si4O_oi4_s_ p1;
    Il2CppObject* p2;
};
    
// Background
struct S_oooo_
{
    Il2CppObject* p0;
    Il2CppObject* p1;
    Il2CppObject* p2;
    Il2CppObject* p3;
};
    
// CanStartDragArgs
struct S_oi4oi4_
{
    Il2CppObject* p0;
    int32_t p1;
    Il2CppObject* p2;
    int32_t p3;
};
    
// StartDragArgs
struct S_si4i4ooo_
{
    Il2CppString* p0;
    int32_t p1;
    int32_t p2;
    Il2CppObject* p3;
    Il2CppObject* p4;
    Il2CppObject* p5;
};
    
// SetupDragAndDropArgs
struct S_ooS_si4i4ooo__
{
    Il2CppObject* p0;
    Il2CppObject* p1;
    struct S_si4i4ooo_ p2;
};
    
// DragAndDropArgs
struct S_Oi4i4i4i4oi4_
{
    Il2CppObject* p0;
    int32_t p1;
    int32_t p2;
    int32_t p3;
    int32_t p4;
    Il2CppObject* p5;
    int32_t p6;
};
    
// HandleDragAndDropArgs
struct S_S_Oi4i4i4i4oi4_S_r4r4__
{
    struct S_Oi4i4i4i4oi4_ p0;
    struct S_r4r4_ p1;
};
    
// ColumnState
struct S_i4sr4S_r4i4_b_
{
    int32_t p0;
    Il2CppString* p1;
    float p2;
    struct S_r4i4_ p3;
    bool p4;
};
    
// ManipulatorActivationFilter
struct S_i4i4i4_
{
    int32_t p0;
    int32_t p1;
    int32_t p2;
};
    
// StyleSelectorPart
struct S_si4Oi4_
{
    Il2CppString* p0;
    int32_t p1;
    Il2CppObject* p2;
    int32_t p3;
};
    
// Matrix2D
struct S_r4r4r4r4r4r4_
{
    float p0;
    float p1;
    float p2;
    float p3;
    float p4;
    float p5;
};
    
// PathProperties
struct S_oi4i4i4_
{
    Il2CppObject* p0;
    int32_t p1;
    int32_t p2;
    int32_t p3;
};
    
// ValueTuple`2
struct S_oS_i4__
{
    Il2CppObject* p0;
    struct S_i4_ p1;
};
    
// ThermalMetrics
struct S_i4r4r4_
{
    int32_t p0;
    float p1;
    float p2;
};
    
// PerformanceLevelChangeEventArgs
struct S_i4i4i4i4i4b_
{
    int32_t p0;
    int32_t p1;
    int32_t p2;
    int32_t p3;
    int32_t p4;
    bool p5;
};
    
// PerformanceBoostChangeEventArgs
struct S_bb_
{
    bool p0;
    bool p1;
};
    
// ContactPoint2D
struct S_S_r4r4_S_r4r4_S_r4r4_r4r4r4r4r4S_u8_S_u8_S_u8_S_u8_i4_
{
    struct S_r4r4_ p0;
    struct S_r4r4_ p1;
    struct S_r4r4_ p2;
    float p3;
    float p4;
    float p5;
    float p6;
    float p7;
    struct S_u8_ p8;
    struct S_u8_ p9;
    struct S_u8_ p10;
    struct S_u8_ p11;
    int32_t p12;
};
    
// PhysicsShape2D
struct S_i4r4i4i4i4i4S_r4r4_S_r4r4__
{
    int32_t p0;
    float p1;
    int32_t p2;
    int32_t p3;
    int32_t p4;
    int32_t p5;
    struct S_r4r4_ p6;
    struct S_r4r4_ p7;
};
    
// RaycastHit2D
struct S_S_r4r4_S_r4r4_S_r4r4_r4r4S_u8__
{
    struct S_r4r4_ p0;
    struct S_r4r4_ p1;
    struct S_r4r4_ p2;
    float p3;
    float p4;
    struct S_u8_ p5;
};
    
// VFXOutputEventArgs
struct S_i4o_
{
    int32_t p0;
    Il2CppObject* p1;
};
    
// DateTimeOffset
struct S_S_u8_i2_
{
    struct S_u8_ p0;
    int16_t p1;
};
    
// Nullable`1
struct N_bS_S_u8_i2__
{
    bool hasValue;
    struct S_S_u8_i2_ p1;
};
    
// Nullable`1
struct N_br8_
{
    bool hasValue;
    double p1;
};
    
// Nullable`1
struct N_bi8_
{
    bool hasValue;
    int64_t p1;
};
    
// Particle
struct S_S_r4r4r4_S_r4r4r4_S_r4r4r4_S_r4r4r4_S_r4r4r4_S_r4r4r4_S_r4r4r4_S_r4r4r4_S_i4u1u1u1u1_u4u4r4r4i4r4r4u4_
{
    struct S_r4r4r4_ p0;
    struct S_r4r4r4_ p1;
    struct S_r4r4r4_ p2;
    struct S_r4r4r4_ p3;
    struct S_r4r4r4_ p4;
    struct S_r4r4r4_ p5;
    struct S_r4r4r4_ p6;
    struct S_r4r4r4_ p7;
    struct S_i4u1u1u1u1_ p8;
    uint32_t p9;
    uint32_t p10;
    float p11;
    float p12;
    int32_t p13;
    float p14;
    float p15;
    uint32_t p16;
};
    
// InputDevice
struct S_u8b_
{
    uint64_t p0;
    bool p1;
};
    
// InputFeatureUsage
struct S_su4_
{
    Il2CppString* p0;
    uint32_t p1;
};
    
// Bone
struct S_u8u4_
{
    uint64_t p0;
    uint32_t p1;
};
    
// MeshId
struct S_u8u8_
{
    uint64_t p0;
    uint64_t p1;
};
    
// MeshInfo
struct S_S_u8u8_i4i4_
{
    struct S_u8u8_ p0;
    int32_t p1;
    int32_t p2;
};
    
// MeshGenerationResult
struct S_S_u8u8_ooi4i4u8S_r4r4r4_S_r4r4r4r4_S_r4r4r4__
{
    struct S_u8u8_ p0;
    Il2CppObject* p1;
    Il2CppObject* p2;
    int32_t p3;
    int32_t p4;
    uint64_t p5;
    struct S_r4r4r4_ p6;
    struct S_r4r4r4r4_ p7;
    struct S_r4r4r4_ p8;
};
    
// LabelLayoutData
struct S_S_r4r4r4r4_r4r4b_
{
    struct S_r4r4r4r4_ p0;
    float p1;
    float p2;
    bool p3;
};
    
// DataModeChangeEventArgs
struct S_i4b_
{
    int32_t p0;
    bool p1;
};
    
// MetaData
struct S_r4_
{
    float p0;
};
    
// OverlaySaveData
struct S_sS_r4__
{
    Il2CppString* p0;
    struct S_r4_ p1;
};
    
// EventInterests
struct S_bbb_
{
    bool p0;
    bool p1;
    bool p2;
};
    
// Nullable`1
struct N_bi4_
{
    bool hasValue;
    int32_t p1;
};
    
// FlowEvent
struct S_i4u4u1_
{
    int32_t p0;
    uint32_t p1;
    uint8_t p2;
};
    
// MarkerInfo
struct S_i4u2u2so_
{
    int32_t p0;
    uint16_t p1;
    uint16_t p2;
    Il2CppString* p3;
    Il2CppObject* p4;
};
    
// ProfilerCategoryInfo
struct S_u2S_i4u1u1u1u1_su2_
{
    uint16_t p0;
    struct S_i4u1u1u1u1_ p1;
    Il2CppString* p2;
    uint16_t p3;
};
    
// ProfilerCounterData
struct S_sss_
{
    Il2CppString* p0;
    Il2CppString* p1;
    Il2CppString* p2;
};
    
// CameraMode
struct S_i4ssb_
{
    int32_t p0;
    Il2CppString* p1;
    Il2CppString* p2;
    bool p3;
};
    
// Scene
struct S_S_S_u8___
{
    struct S_S_u8__ p0;
};
    
// LogMessage
struct S_i4i4S_su4_s_
{
    int32_t p0;
    int32_t p1;
    struct S_su4_ p2;
    Il2CppString* p3;
};
    
// ReflectedParameter
struct S_i4sso_
{
    int32_t p0;
    Il2CppString* p1;
    Il2CppString* p2;
    Il2CppObject* p3;
};
    
// ReflectedFunction
struct S_sssooo_
{
    Il2CppString* p0;
    Il2CppString* p1;
    Il2CppString* p2;
    Il2CppObject* p3;
    Il2CppObject* p4;
    Il2CppObject* p5;
};
    
// TextureResource
struct S_r4s_
{
    float p0;
    Il2CppString* p1;
};
    
// CommandHint
struct i8
{
    int64_t p0;
};
    
// ShortcutBindingChangedEventArgs
struct S_sS_o_S_o__
{
    Il2CppString* p0;
    struct S_o_ p1;
    struct S_o_ p2;
};
    
// GUID
struct S_u4u4u4u4_
{
    uint32_t p0;
    uint32_t p1;
    uint32_t p2;
    uint32_t p3;
};
    
// GlobalObjectId
struct S_S_u8u8_S_u4u4u4u4_i4_
{
    struct S_u8u8_ p0;
    struct S_u4u4u4u4_ p1;
    int32_t p2;
};
    
// ObjectSelectorTargetInfo
struct S_S_S_u8u8_S_u4u4u4u4_i4_oo_
{
    struct S_S_u8u8_S_u4u4u4u4_i4_ p0;
    Il2CppObject* p1;
    Il2CppObject* p2;
};
    
// Nullable`1
struct N_bS_r4r4__
{
    bool hasValue;
    struct S_r4r4_ p1;
};
    
// BuildStartedMessageRaw
struct S_i4i4S_i4__
{
    int32_t p0;
    int32_t p1;
    struct S_i4_ p2;
};
    
// BuildStartedMessage
struct S_S_i4i4S_i4___
{
    struct S_i4i4S_i4__ p0;
};
    
// NodeInfoMessageRaw
struct S_i4S_i4_S_i4_S_i4_S_i4_S_i4_S_i4__
{
    int32_t p0;
    struct S_i4_ p1;
    struct S_i4_ p2;
    struct S_i4_ p3;
    struct S_i4_ p4;
    struct S_i4_ p5;
    struct S_i4_ p6;
};
    
// NodeInfo
struct S_oS_i4S_i4_S_i4_S_i4_S_i4_S_i4_S_i4___
{
    Il2CppObject* p0;
    struct S_i4S_i4_S_i4_S_i4_S_i4_S_i4_S_i4__ p1;
};
    
// Nullable`1
struct N_bS_oS_i4S_i4_S_i4_S_i4_S_i4_S_i4_S_i4____
{
    bool hasValue;
    struct S_oS_i4S_i4_S_i4_S_i4_S_i4_S_i4_S_i4___ p1;
};
    
// NodeEnqueuedMessage
struct S_S_oS_i4S_i4_S_i4_S_i4_S_i4_S_i4_S_i4___N_bS_oS_i4S_i4_S_i4_S_i4_S_i4_S_i4_S_i4_____
{
    struct S_oS_i4S_i4_S_i4_S_i4_S_i4_S_i4_S_i4___ p0;
    struct N_bS_oS_i4S_i4_S_i4_S_i4_S_i4_S_i4_S_i4____ p1;
};
    
// NodeStartedMessage
struct S_S_i4i4_S_oS_i4S_i4_S_i4_S_i4_S_i4_S_i4_S_i4___i4_
{
    struct S_i4i4_ p0;
    struct S_oS_i4S_i4_S_i4_S_i4_S_i4_S_i4_S_i4___ p1;
    int32_t p2;
};
    
// NodeUpToDateMessage
struct S_S_oS_i4S_i4_S_i4_S_i4_S_i4_S_i4_S_i4____
{
    struct S_oS_i4S_i4_S_i4_S_i4_S_i4_S_i4_S_i4___ p0;
};
    
// NodeFinishedMessageRaw
struct S_i4i4i4i4S_i4_S_i4__
{
    int32_t p0;
    int32_t p1;
    int32_t p2;
    int32_t p3;
    struct S_i4_ p4;
    struct S_i4_ p5;
};
    
// NodeFinishedMessage
struct S_oS_i4i4i4i4S_i4_S_i4__S_oS_i4S_i4_S_i4_S_i4_S_i4_S_i4_S_i4____
{
    Il2CppObject* p0;
    struct S_i4i4i4i4S_i4_S_i4__ p1;
    struct S_oS_i4S_i4_S_i4_S_i4_S_i4_S_i4_S_i4___ p2;
};
    
// BuildFinishedMessageRaw
struct S_i4S_i4__
{
    int32_t p0;
    struct S_i4_ p1;
};
    
// BuildFinishedMessage
struct S_oS_i4S_i4___
{
    Il2CppObject* p0;
    struct S_i4S_i4__ p1;
};
    
// RPCActionMessageRaw
struct S_i4S_i4_S_i4__
{
    int32_t p0;
    struct S_i4_ p1;
    struct S_i4_ p2;
};
    
// RPCActionMessage
struct S_oS_i4S_i4_S_i4___
{
    Il2CppObject* p0;
    struct S_i4S_i4_S_i4__ p1;
};
    
// UnityVersion
struct S_bi4i4i4i4i4s_
{
    bool p0;
    int32_t p1;
    int32_t p2;
    int32_t p3;
    int32_t p4;
    int32_t p5;
    Il2CppString* p6;
};
    
// SemVersion
struct S_bi4i4i4ss_
{
    bool p0;
    int32_t p1;
    int32_t p2;
    int32_t p3;
    Il2CppString* p4;
    Il2CppString* p5;
};
    
// SerializedDependency
struct S_sosi4_
{
    Il2CppString* p0;
    Il2CppObject* p1;
    Il2CppString* p2;
    int32_t p3;
};
    
// ObjectIdentifier
struct S_S_u4u4u4u4_i8i4s_
{
    struct S_u4u4u4u4_ p0;
    int64_t p1;
    int32_t p2;
    Il2CppString* p3;
};
    
// PostprocessorInfo
struct S_sob_
{
    Il2CppString* p0;
    Il2CppObject* p1;
    bool p2;
};
    
// ChildAnimatorState
struct S_oS_r4r4r4__
{
    Il2CppObject* p0;
    struct S_r4r4r4_ p1;
};
    
// SearchExpressionContext
struct S_S_oooo_ooi4_
{
    struct S_oooo_ p0;
    Il2CppObject* p1;
    Il2CppObject* p2;
    int32_t p3;
};
    
// SearchAsyncResult`1
struct S_S_si4_i4_
{
    struct S_si4_ p0;
    int32_t p1;
};
    
// StringView
struct S_si4i4_
{
    Il2CppString* p0;
    int32_t p1;
    int32_t p2;
};
    
// SearchColumnEventArgs
struct S_oooObS_r4r4r4r4_bb_
{
    Il2CppObject* p0;
    Il2CppObject* p1;
    Il2CppObject* p2;
    Il2CppObject* p3;
    bool p4;
    struct S_r4r4r4r4_ p5;
    bool p6;
    bool p7;
};
    
// SearchColumnCompareArgs
struct S_S_oooObS_r4r4r4r4_bb_S_oooObS_r4r4r4r4_bb_b_
{
    struct S_oooObS_r4r4r4r4_bb_ p0;
    struct S_oooObS_r4r4r4r4_bb_ p1;
    bool p2;
};
    
// SearchExpressionEvaluator
struct S_sssoi4_
{
    Il2CppString* p0;
    Il2CppString* p1;
    Il2CppString* p2;
    Il2CppObject* p3;
    int32_t p4;
};
    
// SearchGlobalEventHandlerContainer
struct S_i4oOi4_
{
    int32_t p0;
    Il2CppObject* p1;
    Il2CppObject* p2;
    int32_t p3;
};
    
// ReadOnlySpan`1
struct S_S_p_i4_
{
    struct S_p_ p0;
    int32_t p1;
};
    
// SearchResultViewDescriptor
struct S_sssr4r4r4oo_
{
    Il2CppString* p0;
    Il2CppString* p1;
    Il2CppString* p2;
    float p3;
    float p4;
    float p5;
    Il2CppObject* p6;
    Il2CppObject* p7;
};
    
// SearchPreviewKey
struct S_i4i4S_r4r4__
{
    int32_t p0;
    int32_t p1;
    struct S_r4r4_ p2;
};
    
// SearchPreview
struct S_S_i4i4S_r4r4__oS_u8__
{
    struct S_i4i4S_r4r4__ p0;
    Il2CppObject* p1;
    struct S_u8_ p2;
};
    
// QueryFilterOperator
struct S_osi4o_
{
    Il2CppObject* p0;
    Il2CppString* p1;
    int32_t p2;
    Il2CppObject* p3;
};
    
// FilterOperatorContext
struct S_oS_osi4o_S_si4i4_S_si4i4__
{
    Il2CppObject* p0;
    struct S_osi4o_ p1;
    struct S_si4i4_ p2;
    struct S_si4i4_ p3;
};
    
// QueryTokenHandler
struct S_ooi4i4o_
{
    Il2CppObject* p0;
    Il2CppObject* p1;
    int32_t p2;
    int32_t p3;
    Il2CppObject* p4;
};
    
// CancellationTokenRegistration
struct S_oS_oi4__
{
    Il2CppObject* p0;
    struct S_oi4_ p1;
};
    
// PropertyDatabaseRecordKey
struct S_u8S_u8u8__
{
    uint64_t p0;
    struct S_u8u8_ p1;
};
    
// PropertyDatabaseVolatileRecordValue
struct S_O_
{
    Il2CppObject* p0;
};
    
// PropertyDatabaseVolatileRecord
struct S_S_u8S_u8u8__bS_O__
{
    struct S_u8S_u8u8__ p0;
    bool p1;
    struct S_O_ p2;
};
    
// PropertyDatabaseRecordValue
struct S_u1u4u4u4u4u4u4u4u4_
{
    uint8_t p0;
    uint32_t p1;
    uint32_t p2;
    uint32_t p3;
    uint32_t p4;
    uint32_t p5;
    uint32_t p6;
    uint32_t p7;
    uint32_t p8;
};
    
// PropertyDatabaseRecord
struct S_S_u8S_u8u8__u1S_u1u4u4u4u4u4u4u4u4__
{
    struct S_u8S_u8u8__ p0;
    uint8_t p1;
    struct S_u1u4u4u4u4u4u4u4u4_ p2;
};
    
// PropertyStringTableHeader
struct S_i4i4i4i4i4_
{
    int32_t p0;
    int32_t p1;
    int32_t p2;
    int32_t p3;
    int32_t p4;
};
    
// ValueTuple`2
struct S_S_u8u8_u4_
{
    struct S_u8u8_ p0;
    uint32_t p1;
};
    
// SerializableGUID
struct S_S_u8u8_u8u8_
{
    struct S_u8u8_ p0;
    uint64_t p1;
    uint64_t p2;
};
    
// PortReference
struct S_S_S_u8u8_u8u8_S_u8u8_si4i4soo_
{
    struct S_S_u8u8_u8u8_ p0;
    struct S_u8u8_ p1;
    Il2CppString* p2;
    int32_t p3;
    int32_t p4;
    Il2CppString* p5;
    Il2CppObject* p6;
    Il2CppObject* p7;
};
    
// ElementColor
struct S_S_r4r4r4r4_bo_
{
    struct S_r4r4r4r4_ p0;
    bool p1;
    Il2CppObject* p2;
};
    
// SubgraphNodePortInfo
struct S_sboob_
{
    Il2CppString* p0;
    bool p1;
    Il2CppObject* p2;
    Il2CppObject* p3;
    bool p4;
};
    
// GraphReference
struct S_S_u8u8_S_u8u8_S_u8__
{
    struct S_u8u8_ p0;
    struct S_u8u8_ p1;
    struct S_u8_ p2;
};
    
// GraphInfos
struct S_S_S_u8u8_S_u8u8_S_u8__sooo_
{
    struct S_S_u8u8_S_u8u8_S_u8__ p0;
    Il2CppString* p1;
    Il2CppObject* p2;
    Il2CppObject* p3;
    Il2CppObject* p4;
};
    
// GroupPath
struct S_S_u8u8_ob_
{
    struct S_u8u8_ p0;
    Il2CppObject* p1;
    bool p2;
};
    
// VariableDeclaration
struct S_oS_u8u8_i4i4_
{
    Il2CppObject* p0;
    struct S_u8u8_ p1;
    int32_t p2;
    int32_t p3;
};
    
// StyleLength
struct S_S_r4i4_i4_
{
    struct S_r4i4_ p0;
    int32_t p1;
};
    
// MovingElement
struct S_oS_r4r4__
{
    Il2CppObject* p0;
    struct S_r4r4_ p1;
};
    
// GraphElementSpacePartitioningKey
struct S_S_u8u8_o_
{
    struct S_u8u8_ p0;
    Il2CppObject* p1;
};
    
// StateComponentVersion
struct S_i4u4_
{
    int32_t p0;
    uint32_t p1;
};
    
// ModelToReposition
struct S_S_u8u8_S_u8u8_i4i4_
{
    struct S_u8u8_ p0;
    struct S_u8u8_ p1;
    int32_t p2;
    int32_t p3;
};
    
// ValueTuple`2
struct S_oS_S_u8u8_o__
{
    Il2CppObject* p0;
    struct S_S_u8u8_o_ p1;
};
    
// ValueTuple`3
struct S_ooS_S_u8u8_o__
{
    Il2CppObject* p0;
    Il2CppObject* p1;
    struct S_S_u8u8_o_ p2;
};
    
// ContextualMenuItem
struct S_i4si4_
{
    int32_t p0;
    Il2CppString* p1;
    int32_t p2;
};
    
// SubgraphAssetProperty
struct S_S_S_u8u8_S_u8u8_S_u8___
{
    struct S_S_u8u8_S_u8u8_S_u8__ p0;
};
    
// SearchProposition
struct S_sssi4i4osS_r4r4r4r4_oi4Os_
{
    Il2CppString* p0;
    Il2CppString* p1;
    Il2CppString* p2;
    int32_t p3;
    int32_t p4;
    Il2CppObject* p5;
    Il2CppString* p6;
    struct S_r4r4r4r4_ p7;
    Il2CppObject* p8;
    int32_t p9;
    Il2CppObject* p10;
    Il2CppString* p11;
};
    
// EditorCurveBinding
struct S_sosi4i4i4i4i4i4S_u8__
{
    Il2CppString* p0;
    Il2CppObject* p1;
    Il2CppString* p2;
    int32_t p3;
    int32_t p4;
    int32_t p5;
    int32_t p6;
    int32_t p7;
    int32_t p8;
    struct S_u8_ p9;
};
    
// Keyframe
struct S_r4r4r4r4i4i4r4r4_
{
    float p0;
    float p1;
    float p2;
    float p3;
    int32_t p4;
    int32_t p5;
    float p6;
    float p7;
};
    
// Nullable`1
struct N_bS_sosi4i4i4i4i4i4S_u8___
{
    bool hasValue;
    struct S_sosi4i4i4i4i4i4S_u8__ p1;
};
    
// Nullable`1
struct N_br4_
{
    bool hasValue;
    float p1;
};
    
// DrawElement
struct S_S_r4r4r4r4_S_r4r4r4r4_o_
{
    struct S_r4r4r4r4_ p0;
    struct S_r4r4r4r4_ p1;
    Il2CppObject* p2;
};
    
// ValueTuple`2
struct S_S_r4r4r4r4_r4_
{
    struct S_r4r4r4r4_ p0;
    float p1;
};
    
// TouchEvent
struct S_i4S_r4r4_i4_
{
    int32_t p0;
    struct S_r4r4_ p1;
    int32_t p2;
};
    
// NodeCreationContext
struct S_S_r4r4_oi4_
{
    struct S_r4r4_ p0;
    Il2CppObject* p1;
    int32_t p2;
};
    
// GraphViewChange
struct S_oooS_r4r4__
{
    Il2CppObject* p0;
    Il2CppObject* p1;
    Il2CppObject* p2;
    struct S_r4r4_ p3;
};
    
// Line2
struct S_S_r4r4_S_r4r4__
{
    struct S_r4r4_ p0;
    struct S_r4r4_ p1;
};
    
// GraphViewChoice
struct S_ooi4b_
{
    Il2CppObject* p0;
    Il2CppObject* p1;
    int32_t p2;
    bool p3;
};
    
// Memory`1
struct S_Oi4i4_
{
    Il2CppObject* p0;
    int32_t p1;
    int32_t p2;
};
    
// ArraySegment`1
struct S_oi4i4_
{
    Il2CppObject* p0;
    int32_t p1;
    int32_t p2;
};
    
// ParsingState
struct S_oi4i4oboooi4i4oi4i4sobboi4bb_
{
    Il2CppObject* p0;
    int32_t p1;
    int32_t p2;
    Il2CppObject* p3;
    bool p4;
    Il2CppObject* p5;
    Il2CppObject* p6;
    Il2CppObject* p7;
    int32_t p8;
    int32_t p9;
    Il2CppObject* p10;
    int32_t p11;
    int32_t p12;
    Il2CppString* p13;
    Il2CppObject* p14;
    bool p15;
    bool p16;
    Il2CppObject* p17;
    int32_t p18;
    bool p19;
    bool p20;
};
    
// SslApplicationProtocol
struct S_S_Oi4i4__
{
    struct S_Oi4i4_ p0;
};
    
// Flags
struct u8
{
    uint64_t p0;
};
    
// AuthorizationState
struct S_obbi4_
{
    Il2CppObject* p0;
    bool p1;
    bool p2;
    int32_t p3;
};
    
// Decimal
struct S_i4i4i4i4u8_
{
    int32_t p0;
    int32_t p1;
    int32_t p2;
    int32_t p3;
    uint64_t p4;
};
    
// SQL_C
struct i2
{
    int16_t p0;
};
    
// ZipGenericExtraField
struct S_u2u2o_
{
    uint16_t p0;
    uint16_t p1;
    Il2CppObject* p2;
};
    
// Variant
struct S_sos_
{
    Il2CppString* p0;
    Il2CppObject* p1;
    Il2CppString* p2;
};
    
// JsonPosition
struct S_i4i4sb_
{
    int32_t p0;
    int32_t p1;
    Il2CppString* p2;
    bool p3;
};
    
// Nullable`1
struct N_bb_
{
    bool hasValue;
    bool p1;
};
    
// BsonType
struct i1
{
    int8_t p0;
};
    
// RaycastResult
struct S_oor4r4i4i4i4i4i4S_r4r4r4_S_r4r4r4_S_r4r4r4_S_r4r4_i4oo_
{
    Il2CppObject* p0;
    Il2CppObject* p1;
    float p2;
    float p3;
    int32_t p4;
    int32_t p5;
    int32_t p6;
    int32_t p7;
    int32_t p8;
    struct S_r4r4r4_ p9;
    struct S_r4r4r4_ p10;
    struct S_r4r4r4_ p11;
    struct S_r4r4_ p12;
    int32_t p13;
    Il2CppObject* p14;
    Il2CppObject* p15;
};
    
// Navigation
struct S_i4boooo_
{
    int32_t p0;
    bool p1;
    Il2CppObject* p2;
    Il2CppObject* p3;
    Il2CppObject* p4;
    Il2CppObject* p5;
};
    
// ColorBlock
struct S_S_r4r4r4r4_S_r4r4r4r4_S_r4r4r4r4_S_r4r4r4r4_S_r4r4r4r4_r4r4_
{
    struct S_r4r4r4r4_ p0;
    struct S_r4r4r4r4_ p1;
    struct S_r4r4r4r4_ p2;
    struct S_r4r4r4r4_ p3;
    struct S_r4r4r4r4_ p4;
    float p5;
    float p6;
};
    
// SemVer2Version
struct S_si4i4i4oi4s_
{
    Il2CppString* p0;
    int32_t p1;
    int32_t p2;
    int32_t p3;
    Il2CppObject* p4;
    int32_t p5;
    Il2CppString* p6;
};
    
// Nullable`1
struct N_bS_si4i4i4oi4s__
{
    bool hasValue;
    struct S_si4i4i4oi4s_ p1;
};
    
// SpriteBone
struct S_ssS_r4r4r4_S_r4r4r4r4_r4i4S_i4u1u1u1u1__
{
    Il2CppString* p0;
    Il2CppString* p1;
    struct S_r4r4r4_ p2;
    struct S_r4r4r4r4_ p3;
    float p4;
    int32_t p5;
    struct S_i4u1u1u1u1_ p6;
};
    
// FontAssetCreationSettings
struct S_ssi4i4i4i4i4i4i4i4i4sssi4r4i4b_
{
    Il2CppString* p0;
    Il2CppString* p1;
    int32_t p2;
    int32_t p3;
    int32_t p4;
    int32_t p5;
    int32_t p6;
    int32_t p7;
    int32_t p8;
    int32_t p9;
    int32_t p10;
    Il2CppString* p11;
    Il2CppString* p12;
    Il2CppString* p13;
    int32_t p14;
    float p15;
    int32_t p16;
    bool p17;
};
    
// HighlightState
struct S_S_i4u1u1u1u1_S_r4r4r4r4__
{
    struct S_i4u1u1u1u1_ p0;
    struct S_r4r4r4r4_ p1;
};
    
// VertexGradient
struct S_S_r4r4r4r4_S_r4r4r4r4_S_r4r4r4r4_S_r4r4r4r4__
{
    struct S_r4r4r4r4_ p0;
    struct S_r4r4r4r4_ p1;
    struct S_r4r4r4r4_ p2;
    struct S_r4r4r4r4_ p3;
};
    
// TMP_TextProcessingStack`1
struct S_oi4r4i4i4i4_
{
    Il2CppObject* p0;
    int32_t p1;
    float p2;
    int32_t p3;
    int32_t p4;
    int32_t p5;
};
    
// TMP_TextProcessingStack`1
struct S_oi4i4i4i4i4_
{
    Il2CppObject* p0;
    int32_t p1;
    int32_t p2;
    int32_t p3;
    int32_t p4;
    int32_t p5;
};
    
// TMP_FontStyleStack
struct S_u1u1u1u1u1u1u1u1u1u1_
{
    uint8_t p0;
    uint8_t p1;
    uint8_t p2;
    uint8_t p3;
    uint8_t p4;
    uint8_t p5;
    uint8_t p6;
    uint8_t p7;
    uint8_t p8;
    uint8_t p9;
};
    
// TMP_TextProcessingStack`1
struct S_oi4S_i4u1u1u1u1_i4i4i4_
{
    Il2CppObject* p0;
    int32_t p1;
    struct S_i4u1u1u1u1_ p2;
    int32_t p3;
    int32_t p4;
    int32_t p5;
};
    
// TMP_TextProcessingStack`1
struct S_oi4S_S_i4u1u1u1u1_S_r4r4r4r4__i4i4i4_
{
    Il2CppObject* p0;
    int32_t p1;
    struct S_S_i4u1u1u1u1_S_r4r4r4r4__ p2;
    int32_t p3;
    int32_t p4;
    int32_t p5;
};
    
// TMP_TextProcessingStack`1
struct S_oi4oi4i4i4_
{
    Il2CppObject* p0;
    int32_t p1;
    Il2CppObject* p2;
    int32_t p3;
    int32_t p4;
    int32_t p5;
};
    
// SpecialCharacter
struct S_oooi4_
{
    Il2CppObject* p0;
    Il2CppObject* p1;
    Il2CppObject* p2;
    int32_t p3;
};
    
// PendingAttack
struct S_or4bb_
{
    Il2CppObject* p0;
    float p1;
    bool p2;
    bool p3;
};
    
// BundleDetails
struct S_su4so_
{
    Il2CppString* p0;
    uint32_t p1;
    Il2CppString* p2;
    Il2CppObject* p3;
};
    
// BuildUsageTagGlobal
struct S_u4u4u4u4u4bbbbbbbbb_
{
    uint32_t p0;
    uint32_t p1;
    uint32_t p2;
    uint32_t p3;
    uint32_t p4;
    bool p5;
    bool p6;
    bool p7;
    bool p8;
    bool p9;
    bool p10;
    bool p11;
    bool p12;
    bool p13;
};
    
// ResourceFile
struct S_ssb_
{
    Il2CppString* p0;
    Il2CppString* p1;
    bool p2;
};
    
// CustomContent
struct S_S_u4u4u4u4_o_
{
    struct S_u4u4u4u4_ p0;
    Il2CppObject* p1;
};
    
// LogEntry
struct S_i4r8i4s_
{
    int32_t p0;
    double p1;
    int32_t p2;
    Il2CppString* p3;
};
    
// AsyncOperationHandle
struct S_oi4s_
{
    Il2CppObject* p0;
    int32_t p1;
    Il2CppString* p2;
};
    
// InstantiationParameters
struct S_S_r4r4r4_S_r4r4r4r4_obb_
{
    struct S_r4r4r4_ p0;
    struct S_r4r4r4r4_ p1;
    Il2CppObject* p2;
    bool p3;
    bool p4;
};
    
// LoadableObjectId
struct S_S_u4u4u4u4_i4i8S_u8u8__
{
    struct S_u4u4u4u4_ p0;
    int32_t p1;
    int64_t p2;
    struct S_u8u8_ p3;
};
    
// LoadableSceneId
struct S_S_u4u4u4u4_i4_
{
    struct S_u4u4u4u4_ p0;
    int32_t p1;
};
    
// SerializedType
struct S_ssob_
{
    Il2CppString* p0;
    Il2CppString* p1;
    Il2CppObject* p2;
    bool p3;
};
    
// ObjectInitializationData
struct S_sS_ssob_so_
{
    Il2CppString* p0;
    struct S_ssob_ p1;
    Il2CppString* p2;
    Il2CppObject* p3;
};
    
// AssetState
struct S_S_u4u4u4u4_S_u8u8__
{
    struct S_u4u4u4u4_ p0;
    struct S_u8u8_ p1;
};
    
// AssetSummary
struct S_i4i4u8_
{
    int32_t p0;
    int32_t p1;
    uint64_t p2;
};
    
// AssetBundleBuild
struct S_ssoo_
{
    Il2CppString* p0;
    Il2CppString* p1;
    Il2CppObject* p2;
    Il2CppObject* p3;
};
    
// BuildEntryData
struct S_ssoobi4b_
{
    Il2CppString* p0;
    Il2CppString* p1;
    Il2CppObject* p2;
    Il2CppObject* p3;
    bool p4;
    int32_t p5;
    bool p6;
};
    
// CheckDupeResult
struct S_ossS_u4u4u4u4__
{
    Il2CppObject* p0;
    Il2CppString* p1;
    Il2CppString* p2;
    struct S_u4u4u4u4_ p3;
};
    
// Entry
struct S_ssss_
{
    Il2CppString* p0;
    Il2CppString* p1;
    Il2CppString* p2;
    Il2CppString* p3;
};
    
// InputStateBlock
struct S_S_i4_u4u4u4_
{
    struct S_i4_ p0;
    uint32_t p1;
    uint32_t p2;
    uint32_t p3;
};
    
// PrimitiveValue
struct S_i4bcu1i1i2u2i4u4i8u8r4r8_
{
    int32_t p0;
    bool p1;
    Il2CppChar p2;
    uint8_t p3;
    int8_t p4;
    int16_t p5;
    uint16_t p6;
    int32_t p7;
    uint32_t p8;
    int64_t p9;
    uint64_t p10;
    float p11;
    double p12;
};
    
// NamedValue
struct S_sS_i4bcu1i1i2u2i4u4i8u8r4r8__
{
    Il2CppString* p0;
    struct S_i4bcu1i1i2u2i4u4i8u8r4r8_ p1;
};
    
// NameAndParameters
struct S_sS_oi4i4__
{
    Il2CppString* p0;
    struct S_oi4i4_ p1;
};
    
// ControlItem
struct S_S_ss_S_ss_S_ss_sssS_oi4i4_S_oi4i4_S_oi4i4_S_oi4i4_u4u4u4S_i4_i4i4S_i4bcu1i1i2u2i4u4i8u8r4r8_S_i4bcu1i1i2u2i4u4i8u8r4r8_S_i4bcu1i1i2u2i4u4i8u8r4r8__
{
    struct S_ss_ p0;
    struct S_ss_ p1;
    struct S_ss_ p2;
    Il2CppString* p3;
    Il2CppString* p4;
    Il2CppString* p5;
    struct S_oi4i4_ p6;
    struct S_oi4i4_ p7;
    struct S_oi4i4_ p8;
    struct S_oi4i4_ p9;
    uint32_t p10;
    uint32_t p11;
    uint32_t p12;
    struct S_i4_ p13;
    int32_t p14;
    int32_t p15;
    struct S_i4bcu1i1i2u2i4u4i8u8r4r8_ p16;
    struct S_i4bcu1i1i2u2i4u4i8u8r4r8_ p17;
    struct S_i4bcu1i1i2u2i4u4i8u8r4r8_ p18;
};
    
// LayoutMatcher
struct S_S_ss_S_o__
{
    struct S_ss_ p0;
    struct S_o_ p1;
};
    
// InputDeviceDescription
struct S_sssssss_
{
    Il2CppString* p0;
    Il2CppString* p1;
    Il2CppString* p2;
    Il2CppString* p3;
    Il2CppString* p4;
    Il2CppString* p5;
    Il2CppString* p6;
};
    
// InputEventPtr
struct S_Pv_
{
    void* p0;
};
    
// InputDeviceCommand
struct S_S_i4_i4_
{
    struct S_i4_ p0;
    int32_t p1;
};
    
// InputEventBuffer
struct S_S_Pvi4i4i4S_pi4i4_i4_i8i4b_
{
    struct S_Pvi4i4i4S_pi4i4_i4_ p0;
    int64_t p1;
    int32_t p2;
    bool p3;
};
    
// StateChangeMonitorTimeout
struct S_or8oi8i4_
{
    Il2CppObject* p0;
    double p1;
    Il2CppObject* p2;
    int64_t p3;
    int32_t p4;
};
    
// InputBinding
struct S_sssssssi4sss_
{
    Il2CppString* p0;
    Il2CppString* p1;
    Il2CppString* p2;
    Il2CppString* p3;
    Il2CppString* p4;
    Il2CppString* p5;
    Il2CppString* p6;
    int32_t p7;
    Il2CppString* p8;
    Il2CppString* p9;
    Il2CppString* p10;
};
    
// Nullable`1
struct N_bS_sssssssi4sss__
{
    bool hasValue;
    struct S_sssssssi4sss_ p1;
};
    
// DeviceArray
struct S_bi4o_
{
    bool p0;
    int32_t p1;
    Il2CppObject* p2;
};
    
// CallbackArray`1
struct S_bS_i4oo_S_i4oo_S_i4oo__
{
    bool p0;
    struct S_i4oo_ p1;
    struct S_i4oo_ p2;
    struct S_i4oo_ p3;
};
    
// <buffer>e__FixedBuffer
struct S_c_
{
    Il2CppChar p0;
};
    
// IMECompositionString
struct S_i4S_c__
{
    int32_t p0;
    struct S_c_ p1;
};
    
// TouchState
struct S_i4S_r4r4_S_r4r4_r4S_r4r4_u1u1u1u1u4r8S_r4r4__
{
    int32_t p0;
    struct S_r4r4_ p1;
    struct S_r4r4_ p2;
    float p3;
    struct S_r4r4_ p4;
    uint8_t p5;
    uint8_t p6;
    uint8_t p7;
    uint8_t p8;
    uint32_t p9;
    double p10;
    struct S_r4r4_ p11;
};
    
// ButtonState
struct S_bi4r4S_oor4r4i4i4i4i4i4S_r4r4r4_S_r4r4r4_S_r4r4r4_S_r4r4_i4oo_ooooS_r4r4_r4i4bbb_
{
    bool p0;
    int32_t p1;
    float p2;
    struct S_oor4r4i4i4i4i4i4S_r4r4r4_S_r4r4r4_S_r4r4r4_S_r4r4_i4oo_ p3;
    Il2CppObject* p4;
    Il2CppObject* p5;
    Il2CppObject* p6;
    Il2CppObject* p7;
    struct S_r4r4_ p8;
    float p9;
    int32_t p10;
    bool p11;
    bool p12;
    bool p13;
};
    
// PointerModel
struct S_bS_bi4r4S_oor4r4i4i4i4i4i4S_r4r4r4_S_r4r4r4_S_r4r4r4_S_r4r4_i4oo_ooooS_r4r4_r4i4bbb_S_bi4r4S_oor4r4i4i4i4i4i4S_r4r4r4_S_r4r4r4_S_r4r4r4_S_r4r4_i4oo_ooooS_r4r4_r4i4bbb_S_bi4r4S_oor4r4i4i4i4i4i4S_r4r4r4_S_r4r4r4_S_r4r4r4_S_r4r4_i4oo_ooooS_r4r4_r4i4bbb_oS_r4r4_S_r4r4_S_r4r4r4_S_r4r4r4r4_r4r4r4r4S_r4r4__
{
    bool p0;
    struct S_bi4r4S_oor4r4i4i4i4i4i4S_r4r4r4_S_r4r4r4_S_r4r4r4_S_r4r4_i4oo_ooooS_r4r4_r4i4bbb_ p1;
    struct S_bi4r4S_oor4r4i4i4i4i4i4S_r4r4r4_S_r4r4r4_S_r4r4r4_S_r4r4_i4oo_ooooS_r4r4_r4i4bbb_ p2;
    struct S_bi4r4S_oor4r4i4i4i4i4i4S_r4r4r4_S_r4r4r4_S_r4r4r4_S_r4r4_i4oo_ooooS_r4r4_r4i4bbb_ p3;
    Il2CppObject* p4;
    struct S_r4r4_ p5;
    struct S_r4r4_ p6;
    struct S_r4r4r4_ p7;
    struct S_r4r4r4r4_ p8;
    float p9;
    float p10;
    float p11;
    float p12;
    struct S_r4r4_ p13;
};
    
// InputUser
struct S_u4_
{
    uint32_t p0;
};
    
// UsageHint
struct S_s_
{
    Il2CppString* p0;
};
    
// XRFeatureDescriptor
struct S_soi4u4_
{
    Il2CppString* p0;
    Il2CppObject* p1;
    int32_t p2;
    uint32_t p3;
};
    
// Record
struct S_oi4u4_
{
    Il2CppObject* p0;
    int32_t p1;
    uint32_t p2;
};
    
// DeviceInfo
struct S_i4sS_i4_i4s_
{
    int32_t p0;
    Il2CppString* p1;
    struct S_i4_ p2;
    int32_t p3;
    Il2CppString* p4;
};
    
// UnmanagedMemory
struct S_Pvi4i4i4i4i4i4PvPvPvPvPvPvPvPvPvPvbPv_
{
    void* p0;
    int32_t p1;
    int32_t p2;
    int32_t p3;
    int32_t p4;
    int32_t p5;
    int32_t p6;
    void* p7;
    void* p8;
    void* p9;
    void* p10;
    void* p11;
    void* p12;
    void* p13;
    void* p14;
    void* p15;
    void* p16;
    bool p17;
    void* p18;
};
    
// RaycastHitData
struct S_oS_r4r4r4_S_r4r4_r4_
{
    Il2CppObject* p0;
    struct S_r4r4r4_ p1;
    struct S_r4r4_ p2;
    float p3;
};
    
// InputControlList`1
struct S_i4S_Pvi4i4i4S_pi4i4_i4_i4_
{
    int32_t p0;
    struct S_Pvi4i4i4S_pi4i4_i4_ p1;
    int32_t p2;
};
    
// ValueTuple`2
struct S_oO_
{
    Il2CppObject* p0;
    Il2CppObject* p1;
};
    
// Result`2
struct S_oob_
{
    Il2CppObject* p0;
    Il2CppObject* p1;
    bool p2;
};
    
// ChatResponseFragment
struct S_ssbN_bi4_N_bi4__
{
    Il2CppString* p0;
    Il2CppString* p1;
    bool p2;
    struct N_bi4_ p3;
    struct N_bi4_ p4;
};
    
// CloseReason
struct S_i4soN_bi4_s_
{
    int32_t p0;
    Il2CppString* p1;
    Il2CppObject* p2;
    struct N_bi4_ p3;
    Il2CppString* p4;
};
    
// FunctionCallResult
struct S_bbo_
{
    bool p0;
    bool p1;
    Il2CppObject* p2;
};
    
// HashBucket
struct S_S_ss_o_
{
    struct S_ss_ p0;
    Il2CppObject* p1;
};
    
// KeyValuePair`2
struct S_i4S_S_ss_o__
{
    int32_t p0;
    struct S_S_ss_o_ p1;
};
    
// HashBucket
struct S_S_si4_o_
{
    struct S_si4_ p0;
    Il2CppObject* p1;
};
    
// KeyValuePair`2
struct S_i4S_S_si4_o__
{
    int32_t p0;
    struct S_S_si4_o_ p1;
};
    
// SymbolDisplayPart
struct S_i4so_
{
    int32_t p0;
    Il2CppString* p1;
    Il2CppObject* p2;
};
    
// MetadataReferenceProperties
struct S_u1S_o_bb_
{
    uint8_t p0;
    struct S_o_ p1;
    bool p2;
    bool p3;
};
    
// CompilationAnalysisContext
struct S_oooooS_o__
{
    Il2CppObject* p0;
    Il2CppObject* p1;
    Il2CppObject* p2;
    Il2CppObject* p3;
    Il2CppObject* p4;
    struct S_o_ p5;
};
    
// SemanticModelAnalysisContext
struct S_ooooS_o__
{
    Il2CppObject* p0;
    Il2CppObject* p1;
    Il2CppObject* p2;
    Il2CppObject* p3;
    struct S_o_ p4;
};
    
// ObjectBinderSnapshot
struct S_oS_o_S_o__
{
    Il2CppObject* p0;
    struct S_o_ p1;
    struct S_o_ p2;
};
    
// SyntaxToken
struct S_ooi4i4_
{
    Il2CppObject* p0;
    Il2CppObject* p1;
    int32_t p2;
    int32_t p3;
};
    
// SyntaxTrivia
struct S_S_ooi4i4_oi4i4_
{
    struct S_ooi4i4_ p0;
    Il2CppObject* p1;
    int32_t p2;
    int32_t p3;
};
    
// CodeBlockAnalysisContext
struct S_ooooooS_o__
{
    Il2CppObject* p0;
    Il2CppObject* p1;
    Il2CppObject* p2;
    Il2CppObject* p3;
    Il2CppObject* p4;
    Il2CppObject* p5;
    struct S_o_ p6;
};
    
// LocalSlotDebugInfo
struct S_i4S_i4i4__
{
    int32_t p0;
    struct S_i4i4_ p1;
};
    
// LocalScope
struct S_i4i4S_o_S_o__
{
    int32_t p0;
    int32_t p1;
    struct S_o_ p2;
    struct S_o_ p3;
};
    
// ValueTuple`2
struct S_u1S_O__
{
    uint8_t p0;
    struct S_O_ p1;
};
    
// SequencePoint
struct S_i4i4i4u2u2o_
{
    int32_t p0;
    int32_t p1;
    int32_t p2;
    uint16_t p3;
    uint16_t p4;
    Il2CppObject* p5;
};
    
// RawSequencePoint
struct S_oi4S_i4i4__
{
    Il2CppObject* p0;
    int32_t p1;
    struct S_i4i4_ p2;
};
    
// KeyValuePair`2
struct S_oS_o__
{
    Il2CppObject* p0;
    struct S_o_ p1;
};
    
// HashBucket
struct S_S_oS_o__o_
{
    struct S_oS_o__ p0;
    Il2CppObject* p1;
};
    
// KeyValuePair`2
struct S_i4S_S_oS_o__o__
{
    int32_t p0;
    struct S_S_oS_o__o_ p1;
};
    
// UsedNamespaceOrType
struct S_sooos_
{
    Il2CppString* p0;
    Il2CppObject* p1;
    Il2CppObject* p2;
    Il2CppObject* p3;
    Il2CppString* p4;
};
    
// DefinitionWithLocation
struct S_oi4i4i4i4_
{
    Il2CppObject* p0;
    int32_t p1;
    int32_t p2;
    int32_t p3;
    int32_t p4;
};
    
// HashBucket
struct S_S_oi4i4i4i4_o_
{
    struct S_oi4i4i4i4_ p0;
    Il2CppObject* p1;
};
    
// KeyValuePair`2
struct S_i4S_S_oi4i4i4i4_o__
{
    int32_t p0;
    struct S_S_oi4i4i4i4_o_ p1;
};
    
// EncHoistedLocalInfo
struct S_S_i4S_i4i4__o_
{
    struct S_i4S_i4i4__ p0;
    Il2CppObject* p1;
};
    
// LambdaDebugInfo
struct S_i4i4S_i4i4__
{
    int32_t p0;
    int32_t p1;
    struct S_i4i4_ p2;
};
    
// SourceSpan
struct S_i4i4i4i4o_
{
    int32_t p0;
    int32_t p1;
    int32_t p2;
    int32_t p3;
    Il2CppObject* p4;
};
    
// ValueTuple`3
struct S_ooi4_
{
    Il2CppObject* p0;
    Il2CppObject* p1;
    int32_t p2;
};
    
// KeyValuePair`2
struct S_oS_ooi4__
{
    Il2CppObject* p0;
    struct S_ooi4_ p1;
};
    
// HashBucket
struct S_S_oS_ooi4__o_
{
    struct S_oS_ooi4__ p0;
    Il2CppObject* p1;
};
    
// KeyValuePair`2
struct S_i4S_S_oS_ooi4__o__
{
    int32_t p0;
    struct S_S_oS_ooi4__o_ p1;
};
    
// HashBucket
struct S_S_oS_oi4__o_
{
    struct S_oS_oi4__ p0;
    Il2CppObject* p1;
};
    
// KeyValuePair`2
struct S_i4S_S_oS_oi4__o__
{
    int32_t p0;
    struct S_S_oS_oi4__o_ p1;
};
    
// OperationBlockAnalysisContext
struct S_S_o_ooooooS_o__
{
    struct S_o_ p0;
    Il2CppObject* p1;
    Il2CppObject* p2;
    Il2CppObject* p3;
    Il2CppObject* p4;
    Il2CppObject* p5;
    Il2CppObject* p6;
    struct S_o_ p7;
};
    
// OperationAnalysisContext
struct S_oooooooS_o__
{
    Il2CppObject* p0;
    Il2CppObject* p1;
    Il2CppObject* p2;
    Il2CppObject* p3;
    Il2CppObject* p4;
    Il2CppObject* p5;
    Il2CppObject* p6;
    struct S_o_ p7;
};
    
// AdditionalFileAnalysisContext
struct S_ooooS_o_o_
{
    Il2CppObject* p0;
    Il2CppObject* p1;
    Il2CppObject* p2;
    Il2CppObject* p3;
    struct S_o_ p4;
    Il2CppObject* p5;
};
    
// KeyValuePair`2
struct S_i4S_oo__
{
    int32_t p0;
    struct S_oo_ p1;
};
    
// KeyValuePair`2
struct S_oS_i8__
{
    Il2CppObject* p0;
    struct S_i8_ p1;
};
    
// HashBucket
struct S_S_oS_i8__o_
{
    struct S_oS_i8__ p0;
    Il2CppObject* p1;
};
    
// KeyValuePair`2
struct S_i4S_S_oS_i8__o__
{
    int32_t p0;
    struct S_S_oS_i8__o_ p1;
};
    
// HashBucket
struct S_S_oi4_o_
{
    struct S_oi4_ p0;
    Il2CppObject* p1;
};
    
// KeyValuePair`2
struct S_i4S_S_oi4_o__
{
    int32_t p0;
    struct S_S_oi4_o_ p1;
};
    
// HashBucket
struct S_S_oo_o_
{
    struct S_oo_ p0;
    Il2CppObject* p1;
};
    
// KeyValuePair`2
struct S_i4S_S_oo_o__
{
    int32_t p0;
    struct S_S_oo_o_ p1;
};
    
// DeclarationInfo
struct S_oS_o_o_
{
    Il2CppObject* p0;
    struct S_o_ p1;
    Il2CppObject* p2;
};
    
// TypedConstant
struct S_i4oO_
{
    int32_t p0;
    Il2CppObject* p1;
    Il2CppObject* p2;
};
    
// KeyValuePair`2
struct S_sS_i4oO__
{
    Il2CppString* p0;
    struct S_i4oO_ p1;
};
    
// SuppressMessageInfo
struct S_sssso_
{
    Il2CppString* p0;
    Il2CppString* p1;
    Il2CppString* p2;
    Il2CppString* p3;
    Il2CppObject* p4;
};
    
// KeyValuePair`2
struct S_sS_sssso__
{
    Il2CppString* p0;
    struct S_sssso_ p1;
};
    
// HashBucket
struct S_S_sS_sssso__o_
{
    struct S_sS_sssso__ p0;
    Il2CppObject* p1;
};
    
// KeyValuePair`2
struct S_i4S_S_sS_sssso__o__
{
    int32_t p0;
    struct S_S_sS_sssso__o_ p1;
};
    
// SectionHeader
struct S_si4i4i4i4i4i4u2u2u4_
{
    Il2CppString* p0;
    int32_t p1;
    int32_t p2;
    int32_t p3;
    int32_t p4;
    int32_t p5;
    int32_t p6;
    uint16_t p7;
    uint16_t p8;
    uint32_t p9;
};
    
// DebugDirectoryEntry
struct S_u4u2u2i4i4i4i4_
{
    uint32_t p0;
    uint16_t p1;
    uint16_t p2;
    int32_t p3;
    int32_t p4;
    int32_t p5;
    int32_t p6;
};
    
// CustomAttributeNamedArgument`1
struct S_su1oO_
{
    Il2CppString* p0;
    uint8_t p1;
    Il2CppObject* p2;
    Il2CppObject* p3;
};
    
// AttributeInfo
struct S_S_i4_u1_
{
    struct S_i4_ p0;
    uint8_t p1;
};
    
// EmbeddedResource
struct S_u4i4s_
{
    uint32_t p0;
    int32_t p1;
    Il2CppString* p2;
};
    
// KeyValuePair`2
struct S_i4S_so__
{
    int32_t p0;
    struct S_so_ p1;
};
    
// ExceptionRegion
struct S_u2i4i4i4i4i4_
{
    uint16_t p0;
    int32_t p1;
    int32_t p2;
    int32_t p3;
    int32_t p4;
    int32_t p5;
};
    
// MemoryBlock
struct S_Pvi4_
{
    void* p0;
    int32_t p1;
};
    
// BlobReader
struct S_S_Pvi4_PvPv_
{
    struct S_Pvi4_ p0;
    void* p1;
    void* p2;
};
    
// AnonymousTypeKeyField
struct S_sbb_
{
    Il2CppString* p0;
    bool p1;
    bool p2;
};
    
// EncLocalInfo
struct S_S_i4S_i4i4__ou1ob_
{
    struct S_i4S_i4i4__ p0;
    Il2CppObject* p1;
    uint8_t p2;
    Il2CppObject* p3;
    bool p4;
};
    
// KeyValuePair`2
struct S_sS_oo__
{
    Il2CppString* p0;
    struct S_oo_ p1;
};
    
// HashBucket
struct S_S_sS_oo__o_
{
    struct S_sS_oo__ p0;
    Il2CppObject* p1;
};
    
// KeyValuePair`2
struct S_i4S_S_sS_oo__o__
{
    int32_t p0;
    struct S_S_sS_oo__o_ p1;
};
    
// ClassLayoutRow
struct S_u2u4i4_
{
    uint16_t p0;
    uint32_t p1;
    int32_t p2;
};
    
// ConstantRow
struct S_u1i4S_u4__
{
    uint8_t p0;
    int32_t p1;
    struct S_u4_ p2;
};
    
// CustomAttributeRow
struct S_i4i4S_u4__
{
    int32_t p0;
    int32_t p1;
    struct S_u4_ p2;
};
    
// DeclSecurityRow
struct S_u2i4S_u4__
{
    uint16_t p0;
    int32_t p1;
    struct S_u4_ p2;
};
    
// EncLogRow
struct S_i4u1_
{
    int32_t p0;
    uint8_t p1;
};
    
// EventRow
struct S_u2S_u4_i4_
{
    uint16_t p0;
    struct S_u4_ p1;
    int32_t p2;
};
    
// ExportedTypeRow
struct S_u4i4S_u4_S_u4_i4_
{
    uint32_t p0;
    int32_t p1;
    struct S_u4_ p2;
    struct S_u4_ p3;
    int32_t p4;
};
    
// FieldMarshalRow
struct S_i4S_u4__
{
    int32_t p0;
    struct S_u4_ p1;
};
    
// FieldDefRow
struct S_u2S_u4_S_u4__
{
    uint16_t p0;
    struct S_u4_ p1;
    struct S_u4_ p2;
};
    
// FileTableRow
struct S_u4S_u4_S_u4__
{
    uint32_t p0;
    struct S_u4_ p1;
    struct S_u4_ p2;
};
    
// GenericParamRow
struct S_u2u2i4S_u4__
{
    uint16_t p0;
    uint16_t p1;
    int32_t p2;
    struct S_u4_ p3;
};
    
// ImplMapRow
struct S_u2i4S_u4_i4_
{
    uint16_t p0;
    int32_t p1;
    struct S_u4_ p2;
    int32_t p3;
};
    
// ManifestResourceRow
struct S_u4u4S_u4_i4_
{
    uint32_t p0;
    uint32_t p1;
    struct S_u4_ p2;
    int32_t p3;
};
    
// MemberRefRow
struct S_i4S_u4_S_u4__
{
    int32_t p0;
    struct S_u4_ p1;
    struct S_u4_ p2;
};
    
// MethodSemanticsRow
struct S_u2i4i4_
{
    uint16_t p0;
    int32_t p1;
    int32_t p2;
};
    
// MethodRow
struct S_i4u2u2S_u4_S_u4_i4_
{
    int32_t p0;
    uint16_t p1;
    uint16_t p2;
    struct S_u4_ p3;
    struct S_u4_ p4;
    int32_t p5;
};
    
// ModuleRefRow
struct S_S_u4__
{
    struct S_u4_ p0;
};
    
// ParamRow
struct S_u2u2S_u4__
{
    uint16_t p0;
    uint16_t p1;
    struct S_u4_ p2;
};
    
// TypeDefRow
struct S_u4S_u4_S_u4_i4i4i4_
{
    uint32_t p0;
    struct S_u4_ p1;
    struct S_u4_ p2;
    int32_t p3;
    int32_t p4;
    int32_t p5;
};
    
// AssemblyRefTableRow
struct S_oS_u4_S_u4_S_u4_u4S_u4__
{
    Il2CppObject* p0;
    struct S_u4_ p1;
    struct S_u4_ p2;
    struct S_u4_ p3;
    uint32_t p4;
    struct S_u4_ p5;
};
    
// DocumentRow
struct S_S_u4_S_i4_S_u4_S_i4__
{
    struct S_u4_ p0;
    struct S_i4_ p1;
    struct S_u4_ p2;
    struct S_i4_ p3;
};
    
// LocalScopeRow
struct S_i4i4i4i4i4i4_
{
    int32_t p0;
    int32_t p1;
    int32_t p2;
    int32_t p3;
    int32_t p4;
    int32_t p5;
};
    
// LocalConstantRow
struct S_S_u4_S_u4__
{
    struct S_u4_ p0;
    struct S_u4_ p1;
};
    
// CustomDebugInformationRow
struct S_i4S_i4_S_u4__
{
    int32_t p0;
    struct S_i4_ p1;
    struct S_u4_ p2;
};
    
// Entry
struct S_u4u4i4i4_
{
    uint32_t p0;
    uint32_t p1;
    int32_t p2;
    int32_t p3;
};
    
// HashBucket
struct S_S_so_o_
{
    struct S_so_ p0;
    Il2CppObject* p1;
};
    
// KeyValuePair`2
struct S_i4S_S_so_o__
{
    int32_t p0;
    struct S_S_so_o_ p1;
};
    
// SectionNameMatcher
struct S_S_o_o_
{
    struct S_o_ p0;
    Il2CppObject* p1;
};
    
// Nullable`1
struct N_bS_S_o_o__
{
    bool hasValue;
    struct S_S_o_o_ p1;
};
    
// CommandLineReference
struct S_sS_u1S_o_bb__
{
    Il2CppString* p0;
    struct S_u1S_o_bb_ p1;
};
    
// GeneratedSourceText
struct S_os_
{
    Il2CppObject* p0;
    Il2CppString* p1;
};
    
// GeneratedSyntaxTree
struct S_oso_
{
    Il2CppObject* p0;
    Il2CppString* p1;
    Il2CppObject* p2;
};
    
// KeyValuePair`2
struct S_sS_o__
{
    Il2CppString* p0;
    struct S_o_ p1;
};
    
// HashBucket
struct S_S_sS_o__o_
{
    struct S_sS_o__ p0;
    Il2CppObject* p1;
};
    
// KeyValuePair`2
struct S_i4S_S_sS_o__o__
{
    int32_t p0;
    struct S_S_sS_o__o_ p1;
};
    
// GeneratorInfo
struct S_ooob_
{
    Il2CppObject* p0;
    Il2CppObject* p1;
    Il2CppObject* p2;
    bool p3;
};
    
// GeneratorState
struct S_S_o_S_o_S_ooob_ooS_o__
{
    struct S_o_ p0;
    struct S_o_ p1;
    struct S_ooob_ p2;
    Il2CppObject* p3;
    Il2CppObject* p4;
    struct S_o_ p5;
};
    
// GeneratedSourceResult
struct S_oos_
{
    Il2CppObject* p0;
    Il2CppObject* p1;
    Il2CppString* p2;
};
    
// GeneratorRunResult
struct S_oS_o_S_o_o_
{
    Il2CppObject* p0;
    struct S_o_ p1;
    struct S_o_ p2;
    Il2CppObject* p3;
};
    
// KeyValuePair`2
struct S_sS_oS_o___
{
    Il2CppString* p0;
    struct S_oS_o__ p1;
};
    
// HashBucket
struct S_S_sS_oS_o___o_
{
    struct S_sS_oS_o___ p0;
    Il2CppObject* p1;
};
    
// KeyValuePair`2
struct S_i4S_S_sS_oS_o___o__
{
    int32_t p0;
    struct S_S_sS_oS_o___o_ p1;
};
    
// TypeWithAnnotations
struct S_oou1_
{
    Il2CppObject* p0;
    Il2CppObject* p1;
    uint8_t p2;
};
    
// AnonymousTypeKey
struct S_bS_o__
{
    bool p0;
    struct S_o_ p1;
};
    
// NamespaceOrTypeAndUsingDirective
struct S_ooS_o__
{
    Il2CppObject* p0;
    Il2CppObject* p1;
    struct S_o_ p2;
};
    
// MethodWithBody
struct S_ooo_
{
    Il2CppObject* p0;
    Il2CppObject* p1;
    Il2CppObject* p2;
};
    
// ImportInfo
struct S_ou2S_i4i4__
{
    Il2CppObject* p0;
    uint16_t p1;
    struct S_i4i4_ p2;
};
    
// Conversion
struct S_u1o_
{
    uint8_t p0;
    Il2CppObject* p1;
};
    
// TypeParameterDiagnosticInfo
struct S_oS_ooo__
{
    Il2CppObject* p0;
    struct S_ooo_ p1;
};
    
// BinaryOperatorSignature
struct S_ooooi4N_bi4__
{
    Il2CppObject* p0;
    Il2CppObject* p1;
    Il2CppObject* p2;
    Il2CppObject* p3;
    int32_t p4;
    struct N_bi4_ p5;
};
    
// BinaryOperatorAnalysisResult
struct S_S_u1o_S_u1o_S_ooooi4N_bi4__u1_
{
    struct S_u1o_ p0;
    struct S_u1o_ p1;
    struct S_ooooi4N_bi4__ p2;
    uint8_t p3;
};
    
// UnaryOperatorAnalysisResult
struct S_S_oooi4_S_u1o_u1_
{
    struct S_oooi4_ p0;
    struct S_u1o_ p1;
    uint8_t p2;
};
    
// MemberAnalysisResult
struct S_S_o_S_o_S_o_S_o_i4u1b_
{
    struct S_o_ p0;
    struct S_o_ p1;
    struct S_o_ p2;
    struct S_o_ p3;
    int32_t p4;
    uint8_t p5;
    bool p6;
};
    
// MemberResolutionResult`1
struct S_ooS_S_o_S_o_S_o_S_o_i4u1b__
{
    Il2CppObject* p0;
    Il2CppObject* p1;
    struct S_S_o_S_o_S_o_S_o_i4u1b_ p2;
};
    
// KeyValuePair`2
struct S_S_oi4_i4_
{
    struct S_oi4_ p0;
    int32_t p1;
};
    
// KeyValuePair`2
struct S_oS_oou1__
{
    Il2CppObject* p0;
    struct S_oou1_ p1;
};
    
// HashBucket
struct S_S_oS_oou1__o_
{
    struct S_oS_oou1__ p0;
    Il2CppObject* p1;
};
    
// KeyValuePair`2
struct S_i4S_S_oS_oou1__o__
{
    int32_t p0;
    struct S_S_oS_oou1__o_ p1;
};
    
// CompoundUseSiteInfo`1
struct S_bu1ooo_
{
    bool p0;
    uint8_t p1;
    Il2CppObject* p2;
    Il2CppObject* p3;
    Il2CppObject* p4;
};
    
// BitVector
struct S_u8oi4_
{
    uint64_t p0;
    Il2CppObject* p1;
    int32_t p2;
};
    
// SynthesizedDelegateKey
struct S_S_u8oi4_u2bi4_
{
    struct S_u8oi4_ p0;
    uint16_t p1;
    bool p2;
    int32_t p3;
};
    
// AnonymousTypeField
struct S_soS_oou1__
{
    Il2CppString* p0;
    Il2CppObject* p1;
    struct S_oou1_ p2;
};
    
// HashBucket
struct S_S_ou4_o_
{
    struct S_ou4_ p0;
    Il2CppObject* p1;
};
    
// KeyValuePair`2
struct S_i4S_S_ou4_o__
{
    int32_t p0;
    struct S_S_ou4_o_ p1;
};
    
// ModifierInfo`1
struct S_bo_
{
    bool p0;
    Il2CppObject* p1;
};
    
// KeyValuePair`2
struct S_S_i4_o_
{
    struct S_i4_ p0;
    Il2CppObject* p1;
};
    
// HashBucket
struct S_S_S_i4_o_o_
{
    struct S_S_i4_o_ p0;
    Il2CppObject* p1;
};
    
// KeyValuePair`2
struct S_i4S_S_S_i4_o_o__
{
    int32_t p0;
    struct S_S_S_i4_o_o_ p1;
};
    
// KeyValuePair`2
struct S_su1_
{
    Il2CppString* p0;
    uint8_t p1;
};
    
// HashBucket
struct S_S_su1_o_
{
    struct S_su1_ p0;
    Il2CppObject* p1;
};
    
// KeyValuePair`2
struct S_i4S_S_su1_o__
{
    int32_t p0;
    struct S_S_su1_o_ p1;
};
    
// Nullable`1
struct N_bS_i4i4__
{
    bool hasValue;
    struct S_i4i4_ p1;
};
    
// KeyValuePair`2
struct S_i4S_i4oO__
{
    int32_t p0;
    struct S_i4oO_ p1;
};
    
// ParamInfo`1
struct S_boS_i4_S_o_S_o__
{
    bool p0;
    Il2CppObject* p1;
    struct S_i4_ p2;
    struct S_o_ p3;
    struct S_o_ p4;
};
    
// ImmutableBindingDiagnostic`1
struct S_S_o_S_o__
{
    struct S_o_ p0;
    struct S_o_ p1;
};
    
// DeconstructionInfo
struct S_S_u1o__
{
    struct S_u1o_ p0;
};
    
// ExecutionLog
struct S_si4oo_
{
    Il2CppString* p0;
    int32_t p1;
    Il2CppObject* p2;
    Il2CppObject* p3;
};
    
// StringSlice
struct S_si4i4u1_
{
    Il2CppString* p0;
    int32_t p1;
    int32_t p2;
    uint8_t p3;
};
    
// NavMeshBuildSource
struct S_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4_i4i4S_u8_S_u8_i4_
{
    struct S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_ p0;
    struct S_r4r4r4_ p1;
    int32_t p2;
    int32_t p3;
    struct S_u8_ p4;
    struct S_u8_ p5;
    int32_t p6;
};
    
// NavMeshBuildMarkup
struct S_i4i4i4i4i4i4S_u8_i4_
{
    int32_t p0;
    int32_t p1;
    int32_t p2;
    int32_t p3;
    int32_t p4;
    int32_t p5;
    struct S_u8_ p6;
    int32_t p7;
};
    
// LoggingEventData
struct S_sossS_u8_osssso_
{
    Il2CppString* p0;
    Il2CppObject* p1;
    Il2CppString* p2;
    Il2CppString* p3;
    struct S_u8_ p4;
    Il2CppObject* p5;
    Il2CppString* p6;
    Il2CppString* p7;
    Il2CppString* p8;
    Il2CppString* p9;
    Il2CppObject* p10;
};
    
// PurgeFileTypeRequest
struct S_sS_u8__
{
    Il2CppString* p0;
    struct S_u8_ p1;
};
    
// UpdatedItem
struct S_sb_
{
    Il2CppString* p0;
    bool p1;
};
    
// RepositoryKey
struct S_sS_u4u4__
{
    Il2CppString* p0;
    struct S_u4u4_ p1;
};
    
// DownloadedSegment
struct S_S_u4u4_i8u8b_
{
    struct S_u4u4_ p0;
    int64_t p1;
    uint64_t p2;
    bool p3;
};
    
// Nullable`1
struct N_bS_u8__
{
    bool hasValue;
    struct S_u8_ p1;
};
    
// DirectoryConflictResolutionData
struct S_oooi4s_
{
    Il2CppObject* p0;
    Il2CppObject* p1;
    Il2CppObject* p2;
    int32_t p3;
    Il2CppString* p4;
};
    
// BranchRequest
struct S_i8s_
{
    int64_t p0;
    Il2CppString* p1;
};
    
// AllocatorHandle
struct S_u2u2_
{
    uint16_t p0;
    uint16_t p1;
};
    
// Range
struct S_pi4S_u2u2__
{
    void* p0;
    int32_t p1;
    struct S_u2u2_ p2;
};
    
// Block
struct S_S_pi4S_u2u2__i4i4u1u1u2u4_
{
    struct S_pi4S_u2u2__ p0;
    int32_t p1;
    int32_t p2;
    uint8_t p3;
    uint8_t p4;
    uint16_t p5;
    uint32_t p6;
};
    
// PairedUser
struct S_i4u8ss_
{
    int32_t p0;
    uint64_t p1;
    Il2CppString* p2;
    Il2CppString* p3;
};
    
// AnalyticsEventData
struct S_sO_
{
    Il2CppString* p0;
    Il2CppObject* p1;
};
    
// XRView
struct S_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4_ooi4S_r4r4_b_
{
    struct S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_ p0;
    struct S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_ p1;
    struct S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_ p2;
    struct S_r4r4r4r4_ p3;
    Il2CppObject* p4;
    Il2CppObject* p5;
    int32_t p6;
    struct S_r4r4_ p7;
    bool p8;
};
    
// ScriptableRenderContext
struct S_pS_pi4i4__
{
    void* p0;
    struct S_pi4i4_ p1;
};
    
// ValueTuple`2
struct S_OS_oi4__
{
    Il2CppObject* p0;
    struct S_oi4_ p1;
};
    
// RenderTargetIdentifier
struct S_i4i4S_u8_pi4i4i4_
{
    int32_t p0;
    int32_t p1;
    struct S_u8_ p2;
    void* p3;
    int32_t p4;
    int32_t p5;
    int32_t p6;
};
    
// RTHandleProperties
struct S_S_i4i4_S_i4i4_S_i4i4_S_i4i4_S_r4r4r4r4__
{
    struct S_i4i4_ p0;
    struct S_i4i4_ p1;
    struct S_i4i4_ p2;
    struct S_i4i4_ p3;
    struct S_r4r4r4r4_ p4;
};
    
// PassData
struct S_i4i4bi4i4i4i4i4i4i4i4i4i4i4i4i4i4i4i4i4i4i4i4i4i4i4i4i4i4i4i4i4i4i4bbbbbbbb_
{
    int32_t p0;
    int32_t p1;
    bool p2;
    int32_t p3;
    int32_t p4;
    int32_t p5;
    int32_t p6;
    int32_t p7;
    int32_t p8;
    int32_t p9;
    int32_t p10;
    int32_t p11;
    int32_t p12;
    int32_t p13;
    int32_t p14;
    int32_t p15;
    int32_t p16;
    int32_t p17;
    int32_t p18;
    int32_t p19;
    int32_t p20;
    int32_t p21;
    int32_t p22;
    int32_t p23;
    int32_t p24;
    int32_t p25;
    int32_t p26;
    int32_t p27;
    int32_t p28;
    int32_t p29;
    int32_t p30;
    int32_t p31;
    int32_t p32;
    int32_t p33;
    bool p34;
    bool p35;
    bool p36;
    bool p37;
    bool p38;
    bool p39;
    bool p40;
    bool p41;
};
    
// FixedAttachmentArray`1
struct S_S_i4i4_S_i4i4_S_i4i4_S_i4i4_S_i4i4_S_i4i4_S_i4i4_S_i4i4_i4_
{
    struct S_i4i4_ p0;
    struct S_i4i4_ p1;
    struct S_i4i4_ p2;
    struct S_i4i4_ p3;
    struct S_i4i4_ p4;
    struct S_i4i4_ p5;
    struct S_i4i4_ p6;
    struct S_i4i4_ p7;
    int32_t p8;
};
    
// FixedAttachmentArray`1
struct S_S_i4i4i4i4_S_i4i4i4i4_S_i4i4i4i4_S_i4i4i4i4_S_i4i4i4i4_S_i4i4i4i4_S_i4i4i4i4_S_i4i4i4i4_i4_
{
    struct S_i4i4i4i4_ p0;
    struct S_i4i4i4i4_ p1;
    struct S_i4i4i4i4_ p2;
    struct S_i4i4i4i4_ p3;
    struct S_i4i4i4i4_ p4;
    struct S_i4i4i4i4_ p5;
    struct S_i4i4i4i4_ p6;
    struct S_i4i4i4i4_ p7;
    int32_t p8;
};
    
// ResourceHandle
struct S_u4u4i4_
{
    uint32_t p0;
    uint32_t p1;
    int32_t p2;
};
    
// PassFragmentData
struct S_S_u4u4i4_i4i4i4_
{
    struct S_u4u4i4_ p0;
    int32_t p1;
    int32_t p2;
    int32_t p3;
};
    
// FixedAttachmentArray`1
struct S_S_S_u4u4i4_i4i4i4_S_S_u4u4i4_i4i4i4_S_S_u4u4i4_i4i4i4_S_S_u4u4i4_i4i4i4_S_S_u4u4i4_i4i4i4_S_S_u4u4i4_i4i4i4_S_S_u4u4i4_i4i4i4_S_S_u4u4i4_i4i4i4_i4_
{
    struct S_S_u4u4i4_i4i4i4_ p0;
    struct S_S_u4u4i4_i4i4i4_ p1;
    struct S_S_u4u4i4_i4i4i4_ p2;
    struct S_S_u4u4i4_i4i4i4_ p3;
    struct S_S_u4u4i4_i4i4i4_ p4;
    struct S_S_u4u4i4_i4i4i4_ p5;
    struct S_S_u4u4i4_i4i4i4_ p6;
    struct S_S_u4u4i4_i4i4i4_ p7;
    int32_t p8;
};
    
// NativePassAttachment
struct S_S_u4u4i4_i4i4bi4i4_
{
    struct S_u4u4i4_ p0;
    int32_t p1;
    int32_t p2;
    bool p3;
    int32_t p4;
    int32_t p5;
};
    
// FixedAttachmentArray`1
struct S_S_S_u4u4i4_i4i4bi4i4_S_S_u4u4i4_i4i4bi4i4_S_S_u4u4i4_i4i4bi4i4_S_S_u4u4i4_i4i4bi4i4_S_S_u4u4i4_i4i4bi4i4_S_S_u4u4i4_i4i4bi4i4_S_S_u4u4i4_i4i4bi4i4_S_S_u4u4i4_i4i4bi4i4_i4_
{
    struct S_S_u4u4i4_i4i4bi4i4_ p0;
    struct S_S_u4u4i4_i4i4bi4i4_ p1;
    struct S_S_u4u4i4_i4i4bi4i4_ p2;
    struct S_S_u4u4i4_i4i4bi4i4_ p3;
    struct S_S_u4u4i4_i4i4bi4i4_ p4;
    struct S_S_u4u4i4_i4i4bi4i4_ p5;
    struct S_S_u4u4i4_i4i4bi4i4_ p6;
    struct S_S_u4u4i4_i4i4bi4i4_ p7;
    int32_t p8;
};
    
// NativePassData
struct S_S_S_i4i4_S_i4i4_S_i4i4_S_i4i4_S_i4i4_S_i4i4_S_i4i4_S_i4i4_i4_S_S_i4i4i4i4_S_i4i4i4i4_S_i4i4i4i4_S_i4i4i4i4_S_i4i4i4i4_S_i4i4i4i4_S_i4i4i4i4_S_i4i4i4i4_i4_S_i4i4_S_S_S_u4u4i4_i4i4i4_S_S_u4u4i4_i4i4i4_S_S_u4u4i4_i4i4i4_S_S_u4u4i4_i4i4i4_S_S_u4u4i4_i4i4i4_S_S_u4u4i4_i4i4i4_S_S_u4u4i4_i4i4i4_S_S_u4u4i4_i4i4i4_i4_S_S_S_u4u4i4_i4i4bi4i4_S_S_u4u4i4_i4i4bi4i4_S_S_u4u4i4_i4i4bi4i4_S_S_u4u4i4_i4i4bi4i4_S_S_u4u4i4_i4i4bi4i4_S_S_u4u4i4_i4i4bi4i4_S_S_u4u4i4_i4i4bi4i4_S_S_u4u4i4_i4i4bi4i4_i4_i4i4i4i4i4i4i4i4i4i4i4i4bbbi4i4i4i4_
{
    struct S_S_i4i4_S_i4i4_S_i4i4_S_i4i4_S_i4i4_S_i4i4_S_i4i4_S_i4i4_i4_ p0;
    struct S_S_i4i4i4i4_S_i4i4i4i4_S_i4i4i4i4_S_i4i4i4i4_S_i4i4i4i4_S_i4i4i4i4_S_i4i4i4i4_S_i4i4i4i4_i4_ p1;
    struct S_i4i4_ p2;
    struct S_S_S_u4u4i4_i4i4i4_S_S_u4u4i4_i4i4i4_S_S_u4u4i4_i4i4i4_S_S_u4u4i4_i4i4i4_S_S_u4u4i4_i4i4i4_S_S_u4u4i4_i4i4i4_S_S_u4u4i4_i4i4i4_S_S_u4u4i4_i4i4i4_i4_ p3;
    struct S_S_S_u4u4i4_i4i4bi4i4_S_S_u4u4i4_i4i4bi4i4_S_S_u4u4i4_i4i4bi4i4_S_S_u4u4i4_i4i4bi4i4_S_S_u4u4i4_i4i4bi4i4_S_S_u4u4i4_i4i4bi4i4_S_S_u4u4i4_i4i4bi4i4_S_S_u4u4i4_i4i4bi4i4_i4_ p4;
    int32_t p5;
    int32_t p6;
    int32_t p7;
    int32_t p8;
    int32_t p9;
    int32_t p10;
    int32_t p11;
    int32_t p12;
    int32_t p13;
    int32_t p14;
    int32_t p15;
    int32_t p16;
    bool p17;
    bool p18;
    bool p19;
    int32_t p20;
    int32_t p21;
    int32_t p22;
    int32_t p23;
};
    
// CullingResults
struct S_pPvS_pi4i4__
{
    void* p0;
    void* p1;
    struct S_pi4i4_ p2;
};
    
// SortingSettings
struct S_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4_S_r4r4r4_i4i4_
{
    struct S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_ p0;
    struct S_r4r4r4_ p1;
    struct S_r4r4r4_ p2;
    int32_t p3;
    int32_t p4;
};
    
// DrawingSettings
struct S_S_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4_S_r4r4r4_i4i4_S_i4_i4i4S_u8_i4S_u8_i4S_u8_i4i4i4u1_
{
    struct S_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4_S_r4r4r4_i4i4_ p0;
    struct S_i4_ p1;
    int32_t p2;
    int32_t p3;
    struct S_u8_ p4;
    int32_t p5;
    struct S_u8_ p6;
    int32_t p7;
    struct S_u8_ p8;
    int32_t p9;
    int32_t p10;
    int32_t p11;
    uint8_t p12;
};
    
// SortingLayerRange
struct S_i2i2_
{
    int16_t p0;
    int16_t p1;
};
    
// FilteringSettings
struct S_S_i4i4_i4u4u4i4i4S_i2i2__
{
    struct S_i4i4_ p0;
    int32_t p1;
    uint32_t p2;
    uint32_t p3;
    int32_t p4;
    int32_t p5;
    struct S_i2i2_ p6;
};
    
// Nullable`1
struct N_bS_Pvi4i4i4S_pi4i4_i4__
{
    bool hasValue;
    struct S_Pvi4i4i4S_pi4i4_i4_ p1;
};
    
// RendererListParams
struct S_S_pPvS_pi4i4__S_S_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4_S_r4r4r4_i4i4_S_i4_i4i4S_u8_i4S_u8_i4S_u8_i4i4i4u1_S_S_i4i4_i4u4u4i4i4S_i2i2__S_i4_bN_bS_Pvi4i4i4S_pi4i4_i4__N_bS_Pvi4i4i4S_pi4i4_i4___
{
    struct S_pPvS_pi4i4__ p0;
    struct S_S_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4_S_r4r4r4_i4i4_S_i4_i4i4S_u8_i4S_u8_i4S_u8_i4i4i4u1_ p1;
    struct S_S_i4i4_i4u4u4i4i4S_i2i2__ p2;
    struct S_i4_ p3;
    bool p4;
    struct N_bS_Pvi4i4i4S_pi4i4_i4__ p5;
    struct N_bS_Pvi4i4i4S_pi4i4_i4__ p6;
};
    
// RendererListResource
struct S_S_S_pPvS_pi4i4__S_S_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4_S_r4r4r4_i4i4_S_i4_i4i4S_u8_i4S_u8_i4S_u8_i4i4i4u1_S_S_i4i4_i4u4u4i4i4S_i2i2__S_i4_bN_bS_Pvi4i4i4S_pi4i4_i4__N_bS_Pvi4i4i4S_pi4i4_i4___S_pu4u4u4u4__
{
    struct S_S_pPvS_pi4i4__S_S_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4_S_r4r4r4_i4i4_S_i4_i4i4S_u8_i4S_u8_i4S_u8_i4i4i4u1_S_S_i4i4_i4u4u4i4i4S_i2i2__S_i4_bN_bS_Pvi4i4i4S_pi4i4_i4__N_bS_Pvi4i4i4S_pi4i4_i4___ p0;
    struct S_pu4u4u4u4_ p1;
};
    
// RendererListLegacyResource
struct S_S_pu4u4u4u4_b_
{
    struct S_pu4u4u4u4_ p0;
    bool p1;
};
    
// RendererListHandle
struct S_i4bi4_
{
    int32_t p0;
    bool p1;
    int32_t p2;
};
    
// TextureHandle
struct S_S_u4u4i4_b_
{
    struct S_u4u4i4_ p0;
    bool p1;
};
    
// TextureAccess
struct S_S_S_u4u4i4_b_i4i4i4_
{
    struct S_S_u4u4i4_b_ p0;
    int32_t p1;
    int32_t p2;
    int32_t p3;
};
    
// HashEntry`1
struct S_i4i4o_
{
    int32_t p0;
    int32_t p1;
    Il2CppObject* p2;
};
    
// ValueTuple`2
struct S_S_S_u4u4i4_b_i4_
{
    struct S_S_u4u4i4_b_ p0;
    int32_t p1;
};
    
// CellStreamingScratchBufferLayout
struct S_i4i4i4i4i4i4i4i4i4i4i4i4i4i4i4i4i4i4i4i4i4i4i4i4i4i4i4i4_
{
    int32_t p0;
    int32_t p1;
    int32_t p2;
    int32_t p3;
    int32_t p4;
    int32_t p5;
    int32_t p6;
    int32_t p7;
    int32_t p8;
    int32_t p9;
    int32_t p10;
    int32_t p11;
    int32_t p12;
    int32_t p13;
    int32_t p14;
    int32_t p15;
    int32_t p16;
    int32_t p17;
    int32_t p18;
    int32_t p19;
    int32_t p20;
    int32_t p21;
    int32_t p22;
    int32_t p23;
    int32_t p24;
    int32_t p25;
    int32_t p26;
    int32_t p27;
};
    
// PerScenarioData
struct S_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4__
{
    struct S_Pvi4i4i4S_pi4i4_i4_ p0;
    struct S_Pvi4i4i4S_pi4i4_i4_ p1;
    struct S_Pvi4i4i4S_pi4i4_i4_ p2;
    struct S_Pvi4i4i4S_pi4i4_i4_ p3;
    struct S_Pvi4i4i4S_pi4i4_i4_ p4;
    struct S_Pvi4i4i4S_pi4i4_i4_ p5;
    struct S_Pvi4i4i4S_pi4i4_i4_ p6;
    struct S_Pvi4i4i4S_pi4i4_i4_ p7;
};
    
// ObsoleteSerializablePerScenarioDataItem
struct S_sS_i4oo__
{
    Il2CppString* p0;
    struct S_i4oo_ p1;
};
    
// RecordedSampleGroup
struct S_oS_u8__
{
    Il2CppObject* p0;
    struct S_u8_ p1;
};
    
// ValueTuple`3
struct S_Or8o_
{
    Il2CppObject* p0;
    double p1;
    Il2CppObject* p2;
};
    
// SerializedSection
struct S_osu4i4i4i4_
{
    Il2CppObject* p0;
    Il2CppString* p1;
    uint32_t p2;
    int32_t p3;
    int32_t p4;
    int32_t p5;
};
    
// BranchInfo
struct S_i4S_i4_i4i4u2_
{
    int32_t p0;
    struct S_i4_ p1;
    int32_t p2;
    int32_t p3;
    uint16_t p4;
};
    
// ExceptionHandlerInfo
struct S_u2S_i4_S_i4_S_i4_S_i4_S_i4_S_u4__
{
    uint16_t p0;
    struct S_i4_ p1;
    struct S_i4_ p2;
    struct S_i4_ p3;
    struct S_i4_ p4;
    struct S_i4_ p5;
    struct S_u4_ p6;
};
    
// DialogInfo
struct S_i4sssosS_u8_N_bS_u8___
{
    int32_t p0;
    Il2CppString* p1;
    Il2CppString* p2;
    Il2CppString* p3;
    Il2CppObject* p4;
    Il2CppString* p5;
    struct S_u8_ p6;
    struct N_bS_u8__ p7;
};
    
// GPUDrivenMeshRendererData
struct S_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4__
{
    struct S_Pvi4i4i4S_pi4i4_i4_ p0;
    struct S_Pvi4i4i4S_pi4i4_i4_ p1;
    struct S_Pvi4i4i4S_pi4i4_i4_ p2;
    struct S_Pvi4i4i4S_pi4i4_i4_ p3;
    struct S_Pvi4i4i4S_pi4i4_i4_ p4;
    struct S_Pvi4i4i4S_pi4i4_i4_ p5;
    struct S_Pvi4i4i4S_pi4i4_i4_ p6;
    struct S_Pvi4i4i4S_pi4i4_i4_ p7;
    struct S_Pvi4i4i4S_pi4i4_i4_ p8;
    struct S_Pvi4i4i4S_pi4i4_i4_ p9;
    struct S_Pvi4i4i4S_pi4i4_i4_ p10;
    struct S_Pvi4i4i4S_pi4i4_i4_ p11;
    struct S_Pvi4i4i4S_pi4i4_i4_ p12;
    struct S_Pvi4i4i4S_pi4i4_i4_ p13;
    struct S_Pvi4i4i4S_pi4i4_i4_ p14;
    struct S_Pvi4i4i4S_pi4i4_i4_ p15;
    struct S_Pvi4i4i4S_pi4i4_i4_ p16;
    struct S_Pvi4i4i4S_pi4i4_i4_ p17;
    struct S_Pvi4i4i4S_pi4i4_i4_ p18;
    struct S_Pvi4i4i4S_pi4i4_i4_ p19;
};
    
// GPUDrivenLODGroupData
struct S_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_b_
{
    struct S_Pvi4i4i4S_pi4i4_i4_ p0;
    struct S_Pvi4i4i4S_pi4i4_i4_ p1;
    struct S_Pvi4i4i4S_pi4i4_i4_ p2;
    struct S_Pvi4i4i4S_pi4i4_i4_ p3;
    struct S_Pvi4i4i4S_pi4i4_i4_ p4;
    struct S_Pvi4i4i4S_pi4i4_i4_ p5;
    struct S_Pvi4i4i4S_pi4i4_i4_ p6;
    bool p7;
};
    
// TypeDispatchData
struct S_oS_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4__
{
    Il2CppObject* p0;
    struct S_Pvi4i4i4S_pi4i4_i4_ p1;
    struct S_Pvi4i4i4S_pi4i4_i4_ p2;
};
    
// TransformDispatchData
struct S_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4__
{
    struct S_Pvi4i4i4S_pi4i4_i4_ p0;
    struct S_Pvi4i4i4S_pi4i4_i4_ p1;
    struct S_Pvi4i4i4S_pi4i4_i4_ p2;
    struct S_Pvi4i4i4S_pi4i4_i4_ p3;
    struct S_Pvi4i4i4S_pi4i4_i4_ p4;
    struct S_Pvi4i4i4S_pi4i4_i4_ p5;
};
    
// OccluderContext
struct S_i4S_i4i4_S_Pvi4i4i4S_pi4i4_i4_i4S_Pvi4i4i4S_pi4i4_i4_S_i4i4_S_i4i4_oi4oboS_Pvi4i4i4S_pi4i4_i4__
{
    int32_t p0;
    struct S_i4i4_ p1;
    struct S_Pvi4i4i4S_pi4i4_i4_ p2;
    int32_t p3;
    struct S_Pvi4i4i4S_pi4i4_i4_ p4;
    struct S_i4i4_ p5;
    struct S_i4i4_ p6;
    Il2CppObject* p7;
    int32_t p8;
    Il2CppObject* p9;
    bool p10;
    Il2CppObject* p11;
    struct S_Pvi4i4i4S_pi4i4_i4_ p12;
};
    
// OcclusionCullingDebugShaderVariables
struct S_S_r4r4r4r4_S_u4_u4u4u4u4_
{
    struct S_r4r4r4r4_ p0;
    struct S_u4_ p1;
    uint32_t p2;
    uint32_t p3;
    uint32_t p4;
    uint32_t p5;
};
    
// BufferHandle
struct S_S_u4u4i4__
{
    struct S_u4u4i4_ p0;
};
    
// MaterialHeaderScopeItem
struct S_ou4os_
{
    Il2CppObject* p0;
    uint32_t p1;
    Il2CppObject* p2;
    Il2CppString* p3;
};
    
// PassData
struct S_si4oobbi4i4i4boS_si4__
{
    Il2CppString* p0;
    int32_t p1;
    Il2CppObject* p2;
    Il2CppObject* p3;
    bool p4;
    bool p5;
    int32_t p6;
    int32_t p7;
    int32_t p8;
    bool p9;
    Il2CppObject* p10;
    struct S_si4_ p11;
};
    
// CombinedChunks
struct S_ooooi4b_
{
    Il2CppObject* p0;
    Il2CppObject* p1;
    Il2CppObject* p2;
    Il2CppObject* p3;
    int32_t p4;
    bool p5;
};
    
// BoundingSphere
struct S_S_r4r4r4_r4_
{
    struct S_r4r4r4_ p0;
    float p1;
};
    
// HLSLProperty
struct S_si4i4i4o_
{
    Il2CppString* p0;
    int32_t p1;
    int32_t p2;
    int32_t p3;
    Il2CppObject* p4;
};
    
// TextureInfo
struct S_sS_u8_i4bb_
{
    Il2CppString* p0;
    struct S_u8_ p1;
    int32_t p2;
    bool p3;
    bool p4;
};
    
// KeywordEntry
struct S_i4ss_
{
    int32_t p0;
    Il2CppString* p1;
    Il2CppString* p2;
};
    
// DrawState
struct S_bS_r4r4r4r4__
{
    bool p0;
    struct S_r4r4r4r4_ p1;
};
    
// SlotReference
struct S_S_os_i4_
{
    struct S_os_ p0;
    int32_t p1;
};
    
// ShaderMessage
struct S_sssi4i4i4_
{
    Il2CppString* p0;
    Il2CppString* p1;
    Il2CppString* p2;
    int32_t p3;
    int32_t p4;
    int32_t p5;
};
    
// StructData
struct S_S_r4r4r4r4_S_r4r4r4r4_r4bS_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4__
{
    struct S_r4r4r4r4_ p0;
    struct S_r4r4r4r4_ p1;
    float p2;
    bool p3;
    struct S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_ p4;
};
    
// PreviewProperty
struct S_si4S_oooo_S_S_r4r4r4r4_S_r4r4r4r4_r4bS_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4__i4_
{
    Il2CppString* p0;
    int32_t p1;
    struct S_oooo_ p2;
    struct S_S_r4r4r4r4_S_r4r4r4r4_r4bS_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4__ p3;
    int32_t p4;
};
    
// JSONSerializedElement
struct S_S_s_s_
{
    struct S_s_ p0;
    Il2CppString* p1;
};
    
// RiderInfo
struct S_bssos_
{
    bool p0;
    Il2CppString* p1;
    Il2CppString* p2;
    Il2CppObject* p3;
    Il2CppString* p4;
};
    
// MarkerList
struct S_oobb_
{
    Il2CppObject* p0;
    Il2CppObject* p1;
    bool p2;
    bool p3;
};
    
// Entry
struct S_i8i8o_
{
    int64_t p0;
    int64_t p1;
    Il2CppObject* p2;
};
    
// IntervalTreeNode
struct S_i8i4i4i4i4_
{
    int64_t p0;
    int32_t p1;
    int32_t p2;
    int32_t p3;
    int32_t p4;
};
    
// Playable
struct S_S_pu4__
{
    struct S_pu4_ p0;
};
    
// NotificationEntry
struct S_r8obi2_
{
    double p0;
    Il2CppObject* p1;
    bool p2;
    int16_t p3;
};
    
// SemanticVersion
struct S_i4i4i4si4_
{
    int32_t p0;
    int32_t p1;
    int32_t p2;
    Il2CppString* p3;
    int32_t p4;
};
    
// KeyValuePair`2
struct S_i4r4_
{
    int32_t p0;
    float p1;
};
    
// CursorRect
struct S_S_r4r4r4r4_i4_
{
    struct S_r4r4r4r4_ p0;
    int32_t p1;
};
    
// WriterInternalState
struct S_i4i4S_oo__
{
    int32_t p0;
    int32_t p1;
    struct S_oo_ p2;
};
    
// WriteContext
struct S_S_S_p_i4_S_i4i4S_oo___
{
    struct S_S_p_i4_ p0;
    struct S_i4i4S_oo__ p1;
};
    
// ReadOnlySequence`1
struct S_OOi4i4_
{
    Il2CppObject* p0;
    Il2CppObject* p1;
    int32_t p2;
    int32_t p3;
};
    
// Enumerator
struct S_S_OOi4i4_S_Oi4_S_Oi4i4__
{
    struct S_OOi4i4_ p0;
    struct S_Oi4_ p1;
    struct S_Oi4i4_ p2;
};
    
// SegmentedBufferHelper
struct S_N_bi4_S_S_OOi4i4_S_Oi4_S_Oi4i4__o_
{
    struct N_bi4_ p0;
    struct S_S_OOi4i4_S_Oi4_S_Oi4i4__ p1;
    Il2CppObject* p2;
};
    
// ParserInternalState
struct S_i4i4i4i4i4i4S_N_bi4_S_S_OOi4i4_S_Oi4_S_Oi4i4__o_u4u4bi4i4bo_
{
    int32_t p0;
    int32_t p1;
    int32_t p2;
    int32_t p3;
    int32_t p4;
    int32_t p5;
    struct S_N_bi4_S_S_OOi4i4_S_Oi4_S_Oi4i4__o_ p6;
    uint32_t p7;
    uint32_t p8;
    bool p9;
    int32_t p10;
    int32_t p11;
    bool p12;
    Il2CppObject* p13;
};
    
// ParseContext
struct S_S_S_p_i4_S_i4i4i4i4i4i4S_N_bi4_S_S_OOi4i4_S_Oi4_S_Oi4i4__o_u4u4bi4i4bo__
{
    struct S_S_p_i4_ p0;
    struct S_i4i4i4i4i4i4S_N_bi4_S_S_OOi4i4_S_Oi4_S_Oi4i4__o_u4u4bi4i4bo_ p1;
};
    
// JsonNodeOptions
struct S_b_
{
    bool p0;
};
    
// Nullable`1
struct N_bS_b__
{
    bool hasValue;
    struct S_b_ p1;
};
    
// Range
struct S_S_i4_S_i4__
{
    struct S_i4_ p0;
    struct S_i4_ p1;
};
    
// EncodedToken
struct S_i4sS_S_i4_S_i4___
{
    int32_t p0;
    Il2CppString* p1;
    struct S_S_i4_S_i4__ p2;
};
    
// StringSpanOrdinalKey
struct S_Pvi4s_
{
    void* p0;
    int32_t p1;
    Il2CppString* p2;
};
    
// KeyValuePair`2
struct S_i4S_Pvi4s__
{
    int32_t p0;
    struct S_Pvi4s_ p1;
};
    
// NamespaceEntry
struct S_si4i4o_
{
    Il2CppString* p0;
    int32_t p1;
    int32_t p2;
    Il2CppObject* p3;
};
    
// CapturedVariable
struct S_ssu1_
{
    Il2CppString* p0;
    Il2CppString* p1;
    uint8_t p2;
};
    
// AsyncLocalValueChangedArgs`1
struct S_S_o_S_o_b_
{
    struct S_o_ p0;
    struct S_o_ p1;
    bool p2;
};
    
// CallOptions
struct S_oN_bS_u8__S_o_oooi4_
{
    Il2CppObject* p0;
    struct N_bS_u8__ p1;
    struct S_o_ p2;
    Il2CppObject* p3;
    Il2CppObject* p4;
    Il2CppObject* p5;
    int32_t p6;
};
    
// ClientInterceptorContext`2
struct S_osS_oN_bS_u8__S_o_oooi4__
{
    Il2CppObject* p0;
    Il2CppString* p1;
    struct S_oN_bS_u8__S_o_oooi4_ p2;
};
    
// DebugScreenCapture
struct S_S_Pvi4i4i4S_pi4i4_i4_i4i4i4_
{
    struct S_Pvi4i4i4S_pi4i4_i4_ p0;
    int32_t p1;
    int32_t p2;
    int32_t p3;
};
    
// AsyncReadManagerRequestMetric
struct S_ssu8u8u8u8u4bi4i4i4i4r8r8r8_
{
    Il2CppString* p0;
    Il2CppString* p1;
    uint64_t p2;
    uint64_t p3;
    uint64_t p4;
    uint64_t p5;
    uint32_t p6;
    bool p7;
    int32_t p8;
    int32_t p9;
    int32_t p10;
    int32_t p11;
    double p12;
    double p13;
    double p14;
};
    
// DisplayInfo
struct S_u8i4i4S_u4u4_S_i4i4i4i4_sr4_
{
    uint64_t p0;
    int32_t p1;
    int32_t p2;
    struct S_u4u4_ p3;
    struct S_i4i4i4i4_ p4;
    Il2CppString* p5;
    float p6;
};
    
// ReadOnly
struct S_Pvi4S_pi4i4__
{
    void* p0;
    int32_t p1;
    struct S_pi4i4_ p2;
};
    
// PackRectItem
struct S_S_r4r4_S_r4r4_boi4_
{
    struct S_r4r4_ p0;
    struct S_r4r4_ p1;
    bool p2;
    Il2CppObject* p3;
    int32_t p4;
};
    
// DrawResults
struct S_S_pi4i4_S_pi4i4_S_pi4i4_S_pi4i4_S_pi4i4__
{
    struct S_pi4i4_ p0;
    struct S_pi4i4_ p1;
    struct S_pi4i4_ p2;
    struct S_pi4i4_ p3;
    struct S_pi4i4_ p4;
};
    
// VFXBatchedEffectInfo
struct S_ou4u4u4u4u4u4u8u8_
{
    Il2CppObject* p0;
    uint32_t p1;
    uint32_t p2;
    uint32_t p3;
    uint32_t p4;
    uint32_t p5;
    uint32_t p6;
    uint64_t p7;
    uint64_t p8;
};
    
// ParticleCollisionEvent
struct S_S_r4r4r4_S_r4r4r4_S_r4r4r4_S_u8__
{
    struct S_r4r4r4_ p0;
    struct S_r4r4r4_ p1;
    struct S_r4r4r4_ p2;
    struct S_u8_ p3;
};
    
// XRNodeState
struct S_i4i4S_r4r4r4_S_r4r4r4r4_S_r4r4r4_S_r4r4r4_S_r4r4r4_S_r4r4r4_i4u8_
{
    int32_t p0;
    int32_t p1;
    struct S_r4r4r4_ p2;
    struct S_r4r4r4r4_ p3;
    struct S_r4r4r4_ p4;
    struct S_r4r4r4_ p5;
    struct S_r4r4r4_ p6;
    struct S_r4r4r4_ p7;
    int32_t p8;
    uint64_t p9;
};
    
// BuildPlayerOptions
struct S_ossi4i4i4i4oo_
{
    Il2CppObject* p0;
    Il2CppString* p1;
    Il2CppString* p2;
    int32_t p3;
    int32_t p4;
    int32_t p5;
    int32_t p6;
    Il2CppObject* p7;
    Il2CppObject* p8;
};
    
// SubSceneInfo
struct S_oS_S_S_u8___osS_i4u1u1u1u1__
{
    Il2CppObject* p0;
    struct S_S_S_u8___ p1;
    Il2CppObject* p2;
    Il2CppString* p3;
    struct S_i4u1u1u1u1_ p4;
};
    
// RawRepository
struct S_S_u4u4_o_
{
    struct S_u4u4_ p0;
    Il2CppObject* p1;
};
    
// RenderTextureDescriptor
struct S_i4i4i4i4i4i4i4i4i4i4i4i4i4_
{
    int32_t p0;
    int32_t p1;
    int32_t p2;
    int32_t p3;
    int32_t p4;
    int32_t p5;
    int32_t p6;
    int32_t p7;
    int32_t p8;
    int32_t p9;
    int32_t p10;
    int32_t p11;
    int32_t p12;
};
    
// <m_CullingPlanes>e__FixedBuffer
struct S_u1_
{
    uint8_t p0;
};
    
// CoreCameraValues
struct S_i4u4S_u8__
{
    int32_t p0;
    uint32_t p1;
    struct S_u8_ p2;
};
    
// CameraProperties
struct S_S_r4r4r4r4_S_r4r4r4_r4r4r4r4r4S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4_S_r4r4r4_S_r4r4r4_S_r4r4r4_S_r4r4r4_r4u4S_u1_S_u1_r4S_r4r4r4_S_r4_i4S_i4u4S_u8__u4i4i4b_
{
    struct S_r4r4r4r4_ p0;
    struct S_r4r4r4_ p1;
    float p2;
    float p3;
    float p4;
    float p5;
    float p6;
    struct S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_ p7;
    struct S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_ p8;
    struct S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_ p9;
    struct S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_ p10;
    struct S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_ p11;
    struct S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_ p12;
    struct S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_ p13;
    struct S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_ p14;
    struct S_r4r4r4_ p15;
    struct S_r4r4r4_ p16;
    struct S_r4r4r4_ p17;
    struct S_r4r4r4_ p18;
    struct S_r4r4r4_ p19;
    float p20;
    uint32_t p21;
    struct S_u1_ p22;
    struct S_u1_ p23;
    float p24;
    struct S_r4r4r4_ p25;
    struct S_r4_ p26;
    int32_t p27;
    struct S_i4u4S_u8__ p28;
    uint32_t p29;
    int32_t p30;
    int32_t p31;
    bool p32;
};
    
// ScriptableCullingParameters
struct S_S_i4S_r4r4r4_r4r4i4_S_u1_i4i4S_u1_u4u8u8S_r4_i4S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4_r4r4i4i4S_S_r4r4r4r4_S_r4r4r4_r4r4r4r4r4S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4_S_r4r4r4_S_r4r4r4_S_r4r4r4_S_r4r4r4_r4u4S_u1_S_u1_r4S_r4r4r4_S_r4_i4S_i4u4S_u8__u4i4i4b_r4i4S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_r4i4bi4_
{
    struct S_i4S_r4r4r4_r4r4i4_ p0;
    struct S_u1_ p1;
    int32_t p2;
    int32_t p3;
    struct S_u1_ p4;
    uint32_t p5;
    uint64_t p6;
    uint64_t p7;
    struct S_r4_ p8;
    int32_t p9;
    struct S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_ p10;
    struct S_r4r4r4_ p11;
    float p12;
    float p13;
    int32_t p14;
    int32_t p15;
    struct S_S_r4r4r4r4_S_r4r4r4_r4r4r4r4r4S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4_S_r4r4r4_S_r4r4r4_S_r4r4r4_S_r4r4r4_r4u4S_u1_S_u1_r4S_r4r4r4_S_r4_i4S_i4u4S_u8__u4i4i4b_ p16;
    float p17;
    int32_t p18;
    struct S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_ p19;
    struct S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_ p20;
    float p21;
    int32_t p22;
    bool p23;
    int32_t p24;
};
    
// XRRenderPass
struct S_pi4S_i4i4S_u8_pi4i4i4_S_i4i4i4i4i4i4i4i4i4i4i4i4i4_i4i4bS_i4i4S_u8_pi4i4i4_S_i4i4i4i4i4i4i4i4i4i4i4i4i4_bbi4p_
{
    void* p0;
    int32_t p1;
    struct S_i4i4S_u8_pi4i4i4_ p2;
    struct S_i4i4i4i4i4i4i4i4i4i4i4i4i4_ p3;
    int32_t p4;
    int32_t p5;
    bool p6;
    struct S_i4i4S_u8_pi4i4i4_ p7;
    struct S_i4i4i4i4i4i4i4i4i4i4i4i4i4_ p8;
    bool p9;
    bool p10;
    int32_t p11;
    void* p12;
};
    
// XRPassCreateInfo
struct S_S_i4i4S_u8_pi4i4i4_S_i4i4i4i4i4i4i4i4i4i4i4i4i4_S_i4i4S_u8_pi4i4i4_S_i4i4i4i4i4i4i4i4i4i4i4i4i4_S_S_i4S_r4r4r4_r4r4i4_S_u1_i4i4S_u1_u4u8u8S_r4_i4S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4_r4r4i4i4S_S_r4r4r4r4_S_r4r4r4_r4r4r4r4r4S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4_S_r4r4r4_S_r4r4r4_S_r4r4r4_S_r4r4r4_r4u4S_u1_S_u1_r4S_r4r4r4_S_r4_i4S_i4u4S_u8__u4i4i4b_r4i4S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_r4i4bi4_or4i4i4pi4i4bbbi4S_r4r4r4r4_S_r4r4r4r4_S_pi4S_i4i4S_u8_pi4i4i4_S_i4i4i4i4i4i4i4i4i4i4i4i4i4_i4i4bS_i4i4S_u8_pi4i4i4_S_i4i4i4i4i4i4i4i4i4i4i4i4i4_bbi4p__
{
    struct S_i4i4S_u8_pi4i4i4_ p0;
    struct S_i4i4i4i4i4i4i4i4i4i4i4i4i4_ p1;
    struct S_i4i4S_u8_pi4i4i4_ p2;
    struct S_i4i4i4i4i4i4i4i4i4i4i4i4i4_ p3;
    struct S_S_i4S_r4r4r4_r4r4i4_S_u1_i4i4S_u1_u4u8u8S_r4_i4S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4_r4r4i4i4S_S_r4r4r4r4_S_r4r4r4_r4r4r4r4r4S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4_S_r4r4r4_S_r4r4r4_S_r4r4r4_S_r4r4r4_r4u4S_u1_S_u1_r4S_r4r4r4_S_r4_i4S_i4u4S_u8__u4i4i4b_r4i4S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_r4i4bi4_ p4;
    Il2CppObject* p5;
    float p6;
    int32_t p7;
    int32_t p8;
    void* p9;
    int32_t p10;
    int32_t p11;
    bool p12;
    bool p13;
    bool p14;
    int32_t p15;
    struct S_r4r4r4r4_ p16;
    struct S_r4r4r4r4_ p17;
    struct S_pi4S_i4i4S_u8_pi4i4i4_S_i4i4i4i4i4i4i4i4i4i4i4i4i4_i4i4bS_i4i4S_u8_pi4i4i4_S_i4i4i4i4i4i4i4i4i4i4i4i4i4_bbi4p_ p18;
};
    
// ShaderSnippetData
struct S_i4i4sS_u4u4__
{
    int32_t p0;
    int32_t p1;
    Il2CppString* p2;
    struct S_u4u4_ p3;
};
    
// EventHook
struct S_sOO_
{
    Il2CppString* p0;
    Il2CppObject* p1;
    Il2CppObject* p2;
};
    
// BitStack
struct S_ou8i4_
{
    Il2CppObject* p0;
    uint64_t p1;
    int32_t p2;
};
    
// Touch
struct S_oS_oi4u4__
{
    Il2CppObject* p0;
    struct S_oi4u4_ p1;
};
    
// Nullable`1
struct N_bS___
{
    bool hasValue;
    struct S__ p1;
};
    
// StylePropertyValue
struct S_oS_i4i4__
{
    Il2CppObject* p0;
    struct S_i4i4_ p1;
};
    
// VersionInfo
struct S_Oi8_
{
    Il2CppObject* p0;
    int64_t p1;
};
    
// EvalHandlerArgs
struct S_sObi4ooO_
{
    Il2CppString* p0;
    Il2CppObject* p1;
    bool p2;
    int32_t p3;
    Il2CppObject* p4;
    Il2CppObject* p5;
    Il2CppObject* p6;
};
    
// unitytls_errorstate
struct S_u4u4u8_
{
    uint32_t p0;
    uint32_t p1;
    uint64_t p2;
};
    
// Void
struct v
{
    union
    {
        struct
        {
        };
        uint8_t __padding[1];
    };
};
    
// unitytls_tlsctx_callbacks
struct S_ooPv_
{
    Il2CppObject* p0;
    Il2CppObject* p1;
    void* p2;
};
    
// DelegateInfo
struct S_i4oor4_
{
    int32_t p0;
    Il2CppObject* p1;
    Il2CppObject* p2;
    float p3;
};
    
// SerializedLocation
struct S_su8u8_
{
    Il2CppString* p0;
    uint64_t p1;
    uint64_t p2;
};
    
// ObjectSerializedInfo
struct S_S_S_u4u4u4u4_i8i4s_S_su8u8_S_su8u8__
{
    struct S_S_u4u4u4u4_i8i4s_ p0;
    struct S_su8u8_ p1;
    struct S_su8u8_ p2;
};
    
// BindingOverrideJson
struct S_sssss_
{
    Il2CppString* p0;
    Il2CppString* p1;
    Il2CppString* p2;
    Il2CppString* p3;
    Il2CppString* p4;
};
    
// ValueTuple`4
struct S_soi4i4_
{
    Il2CppString* p0;
    Il2CppObject* p1;
    int32_t p2;
    int32_t p3;
};
    
// ValueTuple`5
struct S_si4i4i4S_o__
{
    Il2CppString* p0;
    int32_t p1;
    int32_t p2;
    int32_t p3;
    struct S_o_ p4;
};
    
// KeyValuePair`2
struct S_i2S_O__
{
    int16_t p0;
    struct S_O_ p1;
};
    
// HashBucket
struct S_S_i2S_O__o_
{
    struct S_i2S_O__ p0;
    Il2CppObject* p1;
};
    
// KeyValuePair`2
struct S_i4S_S_i2S_O__o__
{
    int32_t p0;
    struct S_S_i2S_O__o_ p1;
};
    
// ValueTuple`3
struct S_obb_
{
    Il2CppObject* p0;
    bool p1;
    bool p2;
};
    
// HashBucket
struct S_S_ob_o_
{
    struct S_ob_ p0;
    Il2CppObject* p1;
};
    
// KeyValuePair`2
struct S_i4S_S_ob_o__
{
    int32_t p0;
    struct S_S_ob_o_ p1;
};
    
// TextChangeRange
struct S_S_i4i4_i4_
{
    struct S_i4i4_ p0;
    int32_t p1;
};
    
// ValueTuple`2
struct S_oS_oi4i4__
{
    Il2CppObject* p0;
    struct S_oi4i4_ p1;
};
    
// ResolvedReference
struct S_u1i4S_o_S_o_S_o__
{
    uint8_t p0;
    int32_t p1;
    struct S_o_ p2;
    struct S_o_ p3;
    struct S_o_ p4;
};
    
// Cursor
struct S_S_ooi4i4_i4_
{
    struct S_ooi4i4_ p0;
    int32_t p1;
};
    
// Blender
struct S_oS_S_ooi4i4_i4_oi4i4S_o_S_o_i4_
{
    Il2CppObject* p0;
    struct S_S_ooi4i4_i4_ p1;
    Il2CppObject* p2;
    int32_t p3;
    int32_t p4;
    struct S_o_ p5;
    struct S_o_ p6;
    int32_t p7;
};
    
// BlendedNode
struct S_ooS_oS_S_ooi4i4_i4_oi4i4S_o_S_o_i4__
{
    Il2CppObject* p0;
    Il2CppObject* p1;
    struct S_oS_S_ooi4i4_i4_oi4i4S_o_S_o_i4_ p2;
};
    
// Interpolation
struct S_i4i4i4b_
{
    int32_t p0;
    int32_t p1;
    int32_t p2;
    bool p3;
};
    
// HashBucket
struct S_S_S_oi4_i4_o_
{
    struct S_S_oi4_i4_ p0;
    Il2CppObject* p1;
};
    
// KeyValuePair`2
struct S_i4S_S_S_oi4_i4_o__
{
    int32_t p0;
    struct S_S_S_oi4_i4_o_ p1;
};
    
// NullabilityInfo
struct S_u1u1_
{
    uint8_t p0;
    uint8_t p1;
};
    
// ValueTuple`2
struct S_S_u1u1_o_
{
    struct S_u1u1_ p0;
    Il2CppObject* p1;
};
    
// KeyValuePair`2
struct S_oS_S_u1u1_o__
{
    Il2CppObject* p0;
    struct S_S_u1u1_o_ p1;
};
    
// HashBucket
struct S_S_oS_S_u1u1_o__o_
{
    struct S_oS_S_u1u1_o__ p0;
    Il2CppObject* p1;
};
    
// KeyValuePair`2
struct S_i4S_S_oS_S_u1u1_o__o__
{
    int32_t p0;
    struct S_S_oS_S_u1u1_o__o_ p1;
};
    
// HashBucket
struct S_S_S_oo_o_o_
{
    struct S_S_oo_o_ p0;
    Il2CppObject* p1;
};
    
// KeyValuePair`2
struct S_i4S_S_S_oo_o_o__
{
    int32_t p0;
    struct S_S_S_oo_o_o_ p1;
};
    
// KeyValuePair`2
struct S_i4S_oi4__
{
    int32_t p0;
    struct S_oi4_ p1;
};
    
// TypeWithState
struct S_ou1_
{
    Il2CppObject* p0;
    uint8_t p1;
};
    
// KeyValuePair`2
struct S_oS_ou1__
{
    Il2CppObject* p0;
    struct S_ou1_ p1;
};
    
// HashBucket
struct S_S_oS_ou1__o_
{
    struct S_oS_ou1__ p0;
    Il2CppObject* p1;
};
    
// KeyValuePair`2
struct S_i4S_S_oS_ou1__o__
{
    int32_t p0;
    struct S_S_oS_ou1__o_ p1;
};
    
// VisitResult
struct S_S_ou1_S_oou1__
{
    struct S_ou1_ p0;
    struct S_oou1_ p1;
};
    
// ValueTuple`2
struct S_oS_S_ou1_S_oou1___
{
    Il2CppObject* p0;
    struct S_S_ou1_S_oou1__ p1;
};
    
// KeyValuePair`2
struct S_oS_oS_S_ou1_S_oou1____
{
    Il2CppObject* p0;
    struct S_oS_S_ou1_S_oou1___ p1;
};
    
// HashBucket
struct S_S_oS_oS_S_ou1_S_oou1____o_
{
    struct S_oS_oS_S_ou1_S_oou1____ p0;
    Il2CppObject* p1;
};
    
// KeyValuePair`2
struct S_i4S_S_oS_oS_S_ou1_S_oou1____o__
{
    int32_t p0;
    struct S_S_oS_oS_S_ou1_S_oou1____o_ p1;
};
    
// LocalState
struct S_i4oS_u8oi4__
{
    int32_t p0;
    Il2CppObject* p1;
    struct S_u8oi4_ p2;
};
    
// ValueTuple`3
struct S_S_i4oS_u8oi4__S_ou1_b_
{
    struct S_i4oS_u8oi4__ p0;
    struct S_ou1_ p1;
    bool p2;
};
    
// KeyValuePair`2
struct S_Oo_
{
    Il2CppObject* p0;
    Il2CppObject* p1;
};
    
// HashBucket
struct S_S_Oo_o_
{
    struct S_Oo_ p0;
    Il2CppObject* p1;
};
    
// KeyValuePair`2
struct S_i4S_S_Oo_o__
{
    int32_t p0;
    struct S_S_Oo_o_ p1;
};
    
// Optional`1
struct S_bS_i4oS_u8oi4___
{
    bool p0;
    struct S_i4oS_u8oi4__ p1;
};
    
// VisitArgumentResult
struct S_S_S_ou1_S_oou1__S_bS_i4oS_u8oi4____
{
    struct S_S_ou1_S_oou1__ p0;
    struct S_bS_i4oS_u8oi4___ p1;
};
    
// DeconstructionVariable
struct S_oS_oou1_o_
{
    Il2CppObject* p0;
    struct S_oou1_ p1;
    Il2CppObject* p2;
};
    
// ValueTuple`2
struct S_S_i4oS_u8oi4__b_
{
    struct S_i4oS_u8oi4__ p0;
    bool p1;
};
    
// KeyValuePair`2
struct S_oS_S_i4oS_u8oi4__b__
{
    Il2CppObject* p0;
    struct S_S_i4oS_u8oi4__b_ p1;
};
    
// HashBucket
struct S_S_oS_S_i4oS_u8oi4__b__o_
{
    struct S_oS_S_i4oS_u8oi4__b__ p0;
    Il2CppObject* p1;
};
    
// KeyValuePair`2
struct S_i4S_S_oS_S_i4oS_u8oi4__b__o__
{
    int32_t p0;
    struct S_S_oS_S_i4oS_u8oi4__b__o_ p1;
};
    
// KeyValuePair`2
struct S_oS_i4oS_u8oi4___
{
    Il2CppObject* p0;
    struct S_i4oS_u8oi4__ p1;
};
    
// HashBucket
struct S_S_oS_i4oS_u8oi4___o_
{
    struct S_oS_i4oS_u8oi4___ p0;
    Il2CppObject* p1;
};
    
// KeyValuePair`2
struct S_i4S_S_oS_i4oS_u8oi4___o__
{
    int32_t p0;
    struct S_S_oS_i4oS_u8oi4___o_ p1;
};
    
// KeyValuePair`2
struct S_oS_bb__
{
    Il2CppObject* p0;
    struct S_bb_ p1;
};
    
// HashBucket
struct S_S_oS_bb__o_
{
    struct S_oS_bb__ p0;
    Il2CppObject* p1;
};
    
// KeyValuePair`2
struct S_i4S_S_oS_bb__o__
{
    int32_t p0;
    struct S_S_oS_bb__o_ p1;
};
    
// ValueTuple`3
struct S_boo_
{
    bool p0;
    Il2CppObject* p1;
    Il2CppObject* p2;
};
    
// LocalState
struct S_S_u8oi4_b_
{
    struct S_u8oi4_ p0;
    bool p1;
};
    
// KeyValuePair`2
struct S_oS_S_u8oi4_b__
{
    Il2CppObject* p0;
    struct S_S_u8oi4_b_ p1;
};
    
// HashBucket
struct S_S_oS_S_u8oi4_b__o_
{
    struct S_oS_S_u8oi4_b__ p0;
    Il2CppObject* p1;
};
    
// KeyValuePair`2
struct S_i4S_S_oS_S_u8oi4_b__o__
{
    int32_t p0;
    struct S_S_oS_S_u8oi4_b__o_ p1;
};
    
// KeyValuePair`2
struct S_i8i4_
{
    int64_t p0;
    int32_t p1;
};
    
// HashBucket
struct S_S_i8i4_o_
{
    struct S_i8i4_ p0;
    Il2CppObject* p1;
};
    
// KeyValuePair`2
struct S_i4S_S_i8i4_o__
{
    int32_t p0;
    struct S_S_i8i4_o_ p1;
};
    
// KeyValuePair`2
struct S_OS_i4i4__
{
    Il2CppObject* p0;
    struct S_i4i4_ p1;
};
    
// HashBucket
struct S_S_OS_i4i4__o_
{
    struct S_OS_i4i4__ p0;
    Il2CppObject* p1;
};
    
// KeyValuePair`2
struct S_i4S_S_OS_i4i4__o__
{
    int32_t p0;
    struct S_S_OS_i4i4__o_ p1;
};
    
// SwitchBucket
struct S_S_o_i4i4b_
{
    struct S_o_ p0;
    int32_t p1;
    int32_t p2;
    bool p3;
};
    
// KeyValuePair`2
struct S_oS_O__
{
    Il2CppObject* p0;
    struct S_O_ p1;
};
    
// HashBucket
struct S_S_oS_O__o_
{
    struct S_oS_O__ p0;
    Il2CppObject* p1;
};
    
// KeyValuePair`2
struct S_i4S_S_oS_O__o__
{
    int32_t p0;
    struct S_S_oS_O__o_ p1;
};
    
// AssistantConversationId
struct S_bs_
{
    bool p0;
    Il2CppString* p1;
};
    
// OccluderSubviewUpdate
struct S_i4i4S_i4i4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_r4r4r4__
{
    int32_t p0;
    int32_t p1;
    struct S_i4i4_ p2;
    struct S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_ p3;
    struct S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_ p4;
    struct S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_ p5;
    struct S_r4r4r4_ p6;
};
    
// NativeList`1
struct S_S_pi4i4_i4Pv_
{
    struct S_pi4i4_ p0;
    int32_t p1;
    void* p2;
};
    
// ReceiverPlanes
struct S_S_S_pi4i4_i4Pv_i4_
{
    struct S_S_pi4i4_i4Pv_ p0;
    int32_t p1;
};
    
// float3x3
struct S_S_r4r4r4_S_r4r4r4_S_r4r4r4__
{
    struct S_r4r4r4_ p0;
    struct S_r4r4r4_ p1;
    struct S_r4r4r4_ p2;
};
    
// ReceiverSphereCuller
struct S_S_S_pi4i4_i4Pv_S_S_r4r4r4_S_r4r4r4_S_r4r4r4___
{
    struct S_S_pi4i4_i4Pv_ p0;
    struct S_S_r4r4r4_S_r4r4r4_S_r4r4r4__ p1;
};
    
// FrustumPlaneCuller
struct S_S_S_pi4i4_i4Pv_S_S_pi4i4_i4Pv__
{
    struct S_S_pi4i4_i4Pv_ p0;
    struct S_S_pi4i4_i4Pv_ p1;
};
    
// UnsafeParallelHashMap`2
struct S_PvS_u2u2__
{
    void* p0;
    struct S_u2u2_ p1;
};
    
// NativeParallelHashMap`2
struct S_S_PvS_u2u2__S_pi4i4__
{
    struct S_PvS_u2u2__ p0;
    struct S_pi4i4_ p1;
};
    
// UnsafeList`1
struct S_Pvi4i4S_u2u2_i4_
{
    void* p0;
    int32_t p1;
    int32_t p2;
    struct S_u2u2_ p3;
    int32_t p4;
};
    
// NativeHandleAllocator
struct S_S_Pvi4i4S_u2u2_i4_S_Pvi4i4S_u2u2_i4_S_Pvi4i4S_u2u2_i4__
{
    struct S_Pvi4i4S_u2u2_i4_ p0;
    struct S_Pvi4i4S_u2u2_i4_ p1;
    struct S_Pvi4i4S_u2u2_i4_ p2;
};
    
// InstanceAllocators
struct S_S_S_Pvi4i4S_u2u2_i4_S_Pvi4i4S_u2u2_i4_S_Pvi4i4S_u2u2_i4__S_Pvi4i4i4S_pi4i4_i4__
{
    struct S_S_Pvi4i4S_u2u2_i4_S_Pvi4i4S_u2u2_i4_S_Pvi4i4S_u2u2_i4__ p0;
    struct S_Pvi4i4i4S_pi4i4_i4_ p1;
};
    
// NativeReference`1
struct S_PvS_pi4i4_S_u2u2__
{
    void* p0;
    struct S_pi4i4_ p1;
    struct S_u2u2_ p2;
};
    
// EditorOnly
struct S_S_Pvi4i4i4S_pi4i4_i4__
{
    struct S_Pvi4i4i4S_pi4i4_i4_ p0;
};
    
// RenderWorld
struct S_S_PvS_pi4i4_S_u2u2__S_PvS_pi4i4_S_u2u2__S_S_pi4i4_i4Pv_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_i4S_Pvi4i4i4S_pi4i4_i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_i4S_Pvi4i4i4S_pi4i4_i4_i4_S_i4S_Pvi4i4i4S_pi4i4_i4_i4_S_i4S_Pvi4i4i4S_pi4i4_i4_i4_S_i4S_Pvi4i4i4S_pi4i4_i4_i4_S_S_Pvi4i4i4S_pi4i4_i4__S_S_PvS_u2u2__S_pi4i4___
{
    struct S_PvS_pi4i4_S_u2u2__ p0;
    struct S_PvS_pi4i4_S_u2u2__ p1;
    struct S_S_pi4i4_i4Pv_ p2;
    struct S_Pvi4i4i4S_pi4i4_i4_ p3;
    struct S_Pvi4i4i4S_pi4i4_i4_ p4;
    struct S_Pvi4i4i4S_pi4i4_i4_ p5;
    struct S_Pvi4i4i4S_pi4i4_i4_ p6;
    struct S_Pvi4i4i4S_pi4i4_i4_ p7;
    struct S_Pvi4i4i4S_pi4i4_i4_ p8;
    struct S_Pvi4i4i4S_pi4i4_i4_ p9;
    struct S_Pvi4i4i4S_pi4i4_i4_ p10;
    struct S_Pvi4i4i4S_pi4i4_i4_ p11;
    struct S_Pvi4i4i4S_pi4i4_i4_ p12;
    struct S_Pvi4i4i4S_pi4i4_i4_ p13;
    struct S_Pvi4i4i4S_pi4i4_i4_ p14;
    struct S_Pvi4i4i4S_pi4i4_i4_ p15;
    struct S_Pvi4i4i4S_pi4i4_i4_ p16;
    struct S_i4S_Pvi4i4i4S_pi4i4_i4_i4_ p17;
    struct S_Pvi4i4i4S_pi4i4_i4_ p18;
    struct S_Pvi4i4i4S_pi4i4_i4_ p19;
    struct S_i4S_Pvi4i4i4S_pi4i4_i4_i4_ p20;
    struct S_i4S_Pvi4i4i4S_pi4i4_i4_i4_ p21;
    struct S_i4S_Pvi4i4i4S_pi4i4_i4_i4_ p22;
    struct S_i4S_Pvi4i4i4S_pi4i4_i4_i4_ p23;
    struct S_S_Pvi4i4i4S_pi4i4_i4__ p24;
    struct S_S_PvS_u2u2__S_pi4i4__ p25;
};
    
// GPUComponentHandle
struct S_i2_
{
    int16_t p0;
};
    
// DefaultGPUComponents
struct S_S_i2_S_i2_S_i2_S_i2_S_i2_S_i2_S_i2_S_i2_S_Pvi4i4i4S_pi4i4_i4_S_Pvi4i4i4S_pi4i4_i4_S_u8_S_u8_S_u8_S_u8_S_u8_S_i2__
{
    struct S_i2_ p0;
    struct S_i2_ p1;
    struct S_i2_ p2;
    struct S_i2_ p3;
    struct S_i2_ p4;
    struct S_i2_ p5;
    struct S_i2_ p6;
    struct S_i2_ p7;
    struct S_Pvi4i4i4S_pi4i4_i4_ p8;
    struct S_Pvi4i4i4S_pi4i4_i4_ p9;
    struct S_u8_ p10;
    struct S_u8_ p11;
    struct S_u8_ p12;
    struct S_u8_ p13;
    struct S_u8_ p14;
    struct S_i2_ p15;
};
    
// JaggedSpan`1
struct S_S_Pvi4i4S_u2u2_i4_i4_
{
    struct S_Pvi4i4S_u2u2_i4_ p0;
    int32_t p1;
};
    
// MeshRendererUpdateBatch
struct S_S_S_Pvi4i4S_u2u2_i4_i4_S_S_Pvi4i4S_u2u2_i4_i4_S_S_Pvi4i4S_u2u2_i4_i4_S_S_Pvi4i4S_u2u2_i4_i4_S_S_Pvi4i4S_u2u2_i4_i4_S_S_Pvi4i4S_u2u2_i4_i4_S_S_Pvi4i4S_u2u2_i4_i4_S_S_Pvi4i4S_u2u2_i4_i4_S_S_Pvi4i4S_u2u2_i4_i4_S_S_Pvi4i4S_u2u2_i4_i4_S_S_Pvi4i4S_u2u2_i4_i4_S_S_Pvi4i4S_u2u2_i4_i4_S_S_Pvi4i4S_u2u2_i4_i4_S_S_Pvi4i4S_u2u2_i4_i4_S_S_Pvi4i4S_u2u2_i4_i4_S_S_Pvi4i4S_u2u2_i4_i4_S_S_pi4i4_i4Pv_S_Pvi4i4i4S_pi4i4_i4_S_S_Pvi4i4S_u2u2_i4_i4_i4i4i4i4bb_
{
    struct S_S_Pvi4i4S_u2u2_i4_i4_ p0;
    struct S_S_Pvi4i4S_u2u2_i4_i4_ p1;
    struct S_S_Pvi4i4S_u2u2_i4_i4_ p2;
    struct S_S_Pvi4i4S_u2u2_i4_i4_ p3;
    struct S_S_Pvi4i4S_u2u2_i4_i4_ p4;
    struct S_S_Pvi4i4S_u2u2_i4_i4_ p5;
    struct S_S_Pvi4i4S_u2u2_i4_i4_ p6;
    struct S_S_Pvi4i4S_u2u2_i4_i4_ p7;
    struct S_S_Pvi4i4S_u2u2_i4_i4_ p8;
    struct S_S_Pvi4i4S_u2u2_i4_i4_ p9;
    struct S_S_Pvi4i4S_u2u2_i4_i4_ p10;
    struct S_S_Pvi4i4S_u2u2_i4_i4_ p11;
    struct S_S_Pvi4i4S_u2u2_i4_i4_ p12;
    struct S_S_Pvi4i4S_u2u2_i4_i4_ p13;
    struct S_S_Pvi4i4S_u2u2_i4_i4_ p14;
    struct S_S_Pvi4i4S_u2u2_i4_i4_ p15;
    struct S_S_pi4i4_i4Pv_ p16;
    struct S_Pvi4i4i4S_pi4i4_i4_ p17;
    struct S_S_Pvi4i4S_u2u2_i4_i4_ p18;
    int32_t p19;
    int32_t p20;
    int32_t p21;
    int32_t p22;
    bool p23;
    bool p24;
};
    
// NativeHashSet`1
struct S_PvS_pi4i4__
{
    void* p0;
    struct S_pi4i4_ p1;
};
    
// Volume
struct S_S_r4r4r4_S_r4r4r4_S_r4r4r4_S_r4r4r4_r4r4_
{
    struct S_r4r4r4_ p0;
    struct S_r4r4r4_ p1;
    struct S_r4r4r4_ p2;
    struct S_r4r4r4_ p3;
    float p4;
    float p5;
};
    
// ValueTuple`3
struct S_S_S_r4r4r4_S_r4r4r4_S_r4r4r4_S_r4r4r4_r4r4_S_S_r4r4r4_S_r4r4r4__o_
{
    struct S_S_r4r4r4_S_r4r4r4_S_r4r4r4_S_r4r4r4_r4r4_ p0;
    struct S_S_r4r4r4_S_r4r4r4__ p1;
    Il2CppObject* p2;
};
    
// BakingCell
struct S_S_i4i4i4_i4oooooooooooi4i4i4ooS_S_r4r4r4_S_r4r4r4___
{
    struct S_i4i4i4_ p0;
    int32_t p1;
    Il2CppObject* p2;
    Il2CppObject* p3;
    Il2CppObject* p4;
    Il2CppObject* p5;
    Il2CppObject* p6;
    Il2CppObject* p7;
    Il2CppObject* p8;
    Il2CppObject* p9;
    Il2CppObject* p10;
    Il2CppObject* p11;
    Il2CppObject* p12;
    int32_t p13;
    int32_t p14;
    int32_t p15;
    Il2CppObject* p16;
    Il2CppObject* p17;
    struct S_S_r4r4r4_S_r4r4r4__ p18;
};
    
// ValueTuple`2
struct S_S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_S_S_r4r4r4_S_r4r4r4___
{
    struct S_r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4r4_ p0;
    struct S_S_r4r4r4_S_r4r4r4__ p1;
};
    
// TerrainContributor
struct S_oS_S_r4r4r4_S_r4r4r4__S_S_r4r4r4_S_r4r4r4__o_
{
    Il2CppObject* p0;
    struct S_S_r4r4r4_S_r4r4r4__ p1;
    struct S_S_r4r4r4_S_r4r4r4__ p2;
    Il2CppObject* p3;
};
    
// ValueTuple`2
struct S_oS_S_r4r4r4_S_r4r4r4___
{
    Il2CppObject* p0;
    struct S_S_r4r4r4_S_r4r4r4__ p1;
};
    
// ValueTuple`3
struct S_oS_S_r4r4r4_S_r4r4r4_S_r4r4r4_S_r4r4r4_r4r4_S_S_r4r4r4_S_r4r4r4___
{
    Il2CppObject* p0;
    struct S_S_r4r4r4_S_r4r4r4_S_r4r4r4_S_r4r4r4_r4r4_ p1;
    struct S_S_r4r4r4_S_r4r4r4__ p2;
};
    
// FunctionPair
struct S_ssi4_
{
    Il2CppString* p0;
    Il2CppString* p1;
    int32_t p2;
};
    
// NodeEntry
struct S_ooi4s_
{
    Il2CppObject* p0;
    Il2CppObject* p1;
    int32_t p2;
    Il2CppString* p3;
};
    
// Frame
struct S_sS_r4r4r4r4_bbS_r4r4r4r4_S_r4r4_S_r4r4__
{
    Il2CppString* p0;
    struct S_r4r4r4r4_ p1;
    bool p2;
    bool p3;
    struct S_r4r4r4r4_ p4;
    struct S_r4r4_ p5;
    struct S_r4r4_ p6;
};
    
// Entry
struct S_Oi8i8S_r4r4r4r4__
{
    Il2CppObject* p0;
    int64_t p1;
    int64_t p2;
    struct S_r4r4r4r4_ p3;
};
    
// Entry
struct S_i8i8S_Oi8i8S_r4r4r4r4___
{
    int64_t p0;
    int64_t p1;
    struct S_Oi8i8S_r4r4r4r4__ p2;
};
    
// ObjectId
struct S_S_u8_i4_
{
    struct S_u8_ p0;
    int32_t p1;
};
    
// MarkerOverlay
struct S_oS_r4r4r4r4_bbo_
{
    Il2CppObject* p0;
    struct S_r4r4r4r4_ p1;
    bool p2;
    bool p3;
    Il2CppObject* p4;
};
    
// LayerZOrder
struct S_u1i4_
{
    uint8_t p0;
    int32_t p1;
};
    
// ClipBlends
struct S_i4S_r4r4r4r4_i4S_r4r4r4r4__
{
    int32_t p0;
    struct S_r4r4r4r4_ p1;
    int32_t p2;
    struct S_r4r4r4r4_ p3;
};
    
// ClipDrawOptions
struct S_obsbsS_r4r4r4r4__
{
    Il2CppObject* p0;
    bool p1;
    Il2CppString* p2;
    bool p3;
    Il2CppString* p4;
    struct S_r4r4r4r4_ p5;
};
    
// ClipDrawData
struct S_oS_r4r4r4r4_S_r4r4r4r4_S_r4r4r4r4_S_r4r4r4r4_sbbr8r8ooobbi4oS_i4S_r4r4r4r4_i4S_r4r4r4r4__S_obsbsS_r4r4r4r4__o_
{
    Il2CppObject* p0;
    struct S_r4r4r4r4_ p1;
    struct S_r4r4r4r4_ p2;
    struct S_r4r4r4r4_ p3;
    struct S_r4r4r4r4_ p4;
    Il2CppString* p5;
    bool p6;
    bool p7;
    double p8;
    double p9;
    Il2CppObject* p10;
    Il2CppObject* p11;
    Il2CppObject* p12;
    bool p13;
    bool p14;
    int32_t p15;
    Il2CppObject* p16;
    struct S_i4S_r4r4r4r4_i4S_r4r4r4r4__ p17;
    struct S_obsbsS_r4r4r4r4__ p18;
    Il2CppObject* p19;
};
    
// OverlayDrawer
struct S_i4S_r4r4r4r4_soS_r4r4r4r4_oo_
{
    int32_t p0;
    struct S_r4r4r4r4_ p1;
    Il2CppString* p2;
    Il2CppObject* p3;
    struct S_r4r4r4r4_ p4;
    Il2CppObject* p5;
    Il2CppObject* p6;
};
    
// PropertyRef
struct S_u8oo_
{
    uint64_t p0;
    Il2CppObject* p1;
    Il2CppObject* p2;
};
    
// PostProcessingPass
struct S_oi4oS_r4r4r4r4_S_r4r4r4r4_ooobss_
{
    Il2CppObject* p0;
    int32_t p1;
    Il2CppObject* p2;
    struct S_r4r4r4r4_ p3;
    struct S_r4r4r4r4_ p4;
    Il2CppObject* p5;
    Il2CppObject* p6;
    Il2CppObject* p7;
    bool p8;
    Il2CppString* p9;
    Il2CppString* p10;
};
    
// AtlasBlock
struct S_i4i4S_i4i4i4i4_S_r4r4r4r4_o_
{
    int32_t p0;
    int32_t p1;
    struct S_i4i4i4i4_ p2;
    struct S_r4r4r4r4_ p3;
    Il2CppObject* p4;
};
    
// EventCallbackGroupInternal
struct S_ooi4i4i4i4_
{
    Il2CppObject* p0;
    Il2CppObject* p1;
    int32_t p2;
    int32_t p3;
    int32_t p4;
    int32_t p5;
};
    
// EventCallbackGroup
struct S_S_ooi4i4i4i4__
{
    struct S_ooi4i4i4i4_ p0;
};
    
// ActiveBuildStatus
struct S_sN_bS_i4i4___
{
    Il2CppString* p0;
    struct N_bS_i4i4__ p1;
};
    
// SocketReceiveMessageFromResult
struct S_i4i4oS_oi4__
{
    int32_t p0;
    int32_t p1;
    Il2CppObject* p2;
    struct S_oi4_ p3;
};
    
// ValueTuple`5
struct S_obboo_
{
    Il2CppObject* p0;
    bool p1;
    bool p2;
    Il2CppObject* p3;
    Il2CppObject* p4;
};
    
// ValueWebSocketReceiveResult
struct S_u4i4_
{
    uint32_t p0;
    int32_t p1;
};
    
// Nullable`1
struct N_bS_i4i4i4i4u8__
{
    bool hasValue;
    struct S_i4i4i4i4u8_ p1;
};
    
// DownloadStatus
struct S_i8i8b_
{
    int64_t p0;
    int64_t p1;
    bool p2;
};
    
// SceneInstance
struct S_S_S_S_u8___bo_
{
    struct S_S_S_u8___ p0;
    bool p1;
    Il2CppObject* p2;
};
    
// InlinedArray`1
struct S_i4S_ss_o_
{
    int32_t p0;
    struct S_ss_ p1;
    Il2CppObject* p2;
};
    
// UniTask
struct S_oi2_
{
    Il2CppObject* p0;
    int16_t p1;
};
    
// DebugSourceInfo
struct S_S_i4i2i2u1u1u1u1u1u1u1u1_S_o_S_o__
{
    struct S_i4i2i2u1u1u1u1u1u1u1u1_ p0;
    struct S_o_ p1;
    struct S_o_ p2;
};
    
// AnalyzerActions
struct S_S_o_S_o_S_o_S_o_S_o_S_o_S_o_S_o_S_o_S_o_S_o_S_o_S_o_S_o_S_o_S_o_S_o_bb_
{
    struct S_o_ p0;
    struct S_o_ p1;
    struct S_o_ p2;
    struct S_o_ p3;
    struct S_o_ p4;
    struct S_o_ p5;
    struct S_o_ p6;
    struct S_o_ p7;
    struct S_o_ p8;
    struct S_o_ p9;
    struct S_o_ p10;
    struct S_o_ p11;
    struct S_o_ p12;
    struct S_o_ p13;
    struct S_o_ p14;
    struct S_o_ p15;
    struct S_o_ p16;
    bool p17;
    bool p18;
};
    
// EditAndContinueMethodDebugInformation
struct S_i4S_o_S_o_S_o__
{
    int32_t p0;
    struct S_o_ p1;
    struct S_o_ p2;
    struct S_o_ p3;
};
    
// BlobContentId
struct S_S_i4i2i2u1u1u1u1u1u1u1u1_u4_
{
    struct S_i4i2i2u1u1u1u1u1u1u1u1_ p0;
    uint32_t p1;
};
    
// Nullable`1
struct N_bS_oS_oi4___
{
    bool hasValue;
    struct S_oS_oi4__ p1;
};
    
// ValueTuple`2
struct S_S_o_b_
{
    struct S_o_ p0;
    bool p1;
};
    
// AsyncCallState
struct S_OOOOO_
{
    Il2CppObject* p0;
    Il2CppObject* p1;
    Il2CppObject* p2;
    Il2CppObject* p3;
    Il2CppObject* p4;
};
    
// Nullable`1
struct N_bS_Oi4__
{
    bool hasValue;
    struct S_Oi4_ p1;
};
    
// UniTask`1
struct S_ooi2_
{
    Il2CppObject* p0;
    Il2CppObject* p1;
    int16_t p2;
};
    
// UniTask`1
struct S_obi2_
{
    Il2CppObject* p0;
    bool p1;
    int16_t p2;
};
    
// UniTask`1
struct S_oi4i2_
{
    Il2CppObject* p0;
    int32_t p1;
    int16_t p2;
};
    
// UniTask`1
struct S_oi8i2_
{
    Il2CppObject* p0;
    int64_t p1;
    int16_t p2;
};
    
// UniTask`1
struct S_or4i2_
{
    Il2CppObject* p0;
    float p1;
    int16_t p2;
};
    
// UniTask`1
struct S_or8i2_
{
    Il2CppObject* p0;
    double p1;
    int16_t p2;
};
    
// UniTask`1
struct S_oS_i4i4i4i4u8_i2_
{
    Il2CppObject* p0;
    struct S_i4i4i4i4u8_ p1;
    int16_t p2;
};
    
// UniTask`1
struct S_oN_bi4_i2_
{
    Il2CppObject* p0;
    struct N_bi4_ p1;
    int16_t p2;
};
    
// UniTask`1
struct S_oN_bi8_i2_
{
    Il2CppObject* p0;
    struct N_bi8_ p1;
    int16_t p2;
};
    
// UniTask`1
struct S_oN_br4_i2_
{
    Il2CppObject* p0;
    struct N_br4_ p1;
    int16_t p2;
};
    
// UniTask`1
struct S_oN_br8_i2_
{
    Il2CppObject* p0;
    struct N_br8_ p1;
    int16_t p2;
};
    
// UniTask`1
struct S_oN_bS_i4i4i4i4u8__i2_
{
    Il2CppObject* p0;
    struct N_bS_i4i4i4i4u8__ p1;
    int16_t p2;
};
    
// MetadataDb
struct S_i4obb_
{
    int32_t p0;
    Il2CppObject* p1;
    bool p2;
    bool p3;
};
    
// ClientBaseConfigurationInfo
struct S_sS_oN_bS_u8__S_o_oooi4__
{
    Il2CppString* p0;
    struct S_oN_bS_u8__S_o_oooi4_ p1;
};
    
}
