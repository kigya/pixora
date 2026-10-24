import { useEffect, useState, type ReactNode } from 'react';
import { Text, View, StyleSheet, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { PressJelly } from './press-jelly';
import { useKinetikTheme } from '../../lib/kinetik/tokens/theme';
import { useReduceMotion } from '../../lib/kinetik/hooks/use-reduce-motion';

export type ExpandCardProps = {
  image?: ImageSourcePropType;
  title:string;
  subtitle?:string;
  children?:ReactNode;
  selectionSlot?:ReactNode;
  expanded?:boolean;
  defaultExpanded?:boolean;
  onExpandedChange?:(expanded:boolean)=>void;
  imageAspect?:number;
  thumbSize?:number;
  haptics?:boolean;
  style?:StyleProp<ViewStyle>;
};
/** Pixora's text-first adaptation: comparison images mount only in the opened card. */
export function ExpandCard({title,subtitle,children,selectionSlot,expanded,defaultExpanded=false,onExpandedChange,haptics=true,style}:ExpandCardProps) {
  const {colors,space,radius,font}=useKinetikTheme();
  const reduced=useReduceMotion();
  const [internal,setInternal]=useState(defaultExpanded);
  const open=expanded ?? internal;
  const p=useSharedValue(open?1:0);
  useEffect(()=>{p.set(withTiming(open?1:0,{duration:reduced?0:220}));},[open,reduced,p]);
  const reveal=useAnimatedStyle(()=>({opacity:p.get(),transform:[{translateY:(1-p.get())*8}]}));
  return <View style={[{gap:space[3],borderBottomWidth:StyleSheet.hairlineWidth,borderColor:colors.border,paddingBottom:space[4]},style]}>
    <PressJelly variant="surface" haptics={haptics} accessibilityLabel={title} accessibilityState={{expanded:open}} block style={{borderRadius:radius.lg,minHeight:56,height:'auto',paddingVertical:space[3]}} onPress={()=>{
      if(expanded===undefined)setInternal(!open);
      onExpandedChange?.(!open);
    }}>
      <View style={{flexDirection:'row',alignItems:'center',gap:space[3],width:'100%'}}>
        <View style={{flex:1,gap:4}}>
          <Text style={{color:colors.text,fontSize:font.size.md,fontWeight:font.weight.semibold}}>{title}</Text>
          {subtitle && <Text style={{color:colors.textMuted,fontSize:font.size.sm}}>{subtitle}</Text>}
        </View>
        <Text accessibilityElementsHidden style={{color:colors.textMuted,fontSize:20}}>{open?'−':'+'}</Text>
      </View>
    </PressJelly>
    {selectionSlot}
    {open && <Animated.View style={[{gap:space[3]},reveal]}>{children}</Animated.View>}
  </View>;
}
