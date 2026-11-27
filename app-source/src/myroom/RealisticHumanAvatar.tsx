import {
  UnityCharacterBodyAnchor,
  UnityHumanoidCharacter,
} from '../scene/UnityHumanoidCharacter'
import { AvatarGender } from '../types/game'

export interface RealisticHumanAvatarProps {
  seedKey: string
  displayName: string
  gender: AvatarGender
  outfitColor?: string
  accentColor?: string
  uniformStyle?: 'casual' | 'nerdy' | 'sport' | 'cricket'
  hideHead?: boolean
  speakingLevel?: number
  getBodyAnchor: () => UnityCharacterBodyAnchor
  getLeftWrist: () => [number, number, number]
  getRightWrist: () => [number, number, number]
  getLeftHandQuat?: () => [number, number, number, number]
  getRightHandQuat?: () => [number, number, number, number]
  getLeftCurls?: () => [number, number, number, number, number]
  getRightCurls?: () => [number, number, number, number, number]
}

/**
 * Unity-3D-like rigged SkinnedMesh Full-Body Human Avatar for MyRoom AI & Remote Peers.
 * Seamlessly deformed shoulders/elbows/hips/knees/ankles, sculpted orbital face mesh, and layered hair.
 */
export function RealisticHumanAvatar({
  seedKey,
  displayName,
  gender,
  outfitColor,
  accentColor,
  uniformStyle = 'casual',
  hideHead = false,
  speakingLevel = 0,
  getBodyAnchor,
  getLeftWrist,
  getRightWrist,
  getLeftHandQuat,
  getRightHandQuat,
  getLeftCurls,
  getRightCurls,
}: RealisticHumanAvatarProps) {
  return (
    <UnityHumanoidCharacter
      seedKey={seedKey}
      displayName={displayName}
      gender={gender}
      outfitColor={outfitColor}
      accentColor={accentColor}
      uniformStyle={uniformStyle}
      hideHead={hideHead}
      showHair
      allowSunglasses={false}
      speakingLevel={speakingLevel}
      getBodyAnchor={getBodyAnchor}
      getLeftWrist={getLeftWrist}
      getRightWrist={getRightWrist}
      getLeftHandQuat={getLeftHandQuat}
      getRightHandQuat={getRightHandQuat}
      getLeftCurls={getLeftCurls}
      getRightCurls={getRightCurls}
    />
  )
}
