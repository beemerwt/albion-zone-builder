import { CornerName, Point } from './types';
export const CORNER_ORDER: CornerName[] = ['Top', 'Right', 'Bottom', 'Left'];
export const DIAMOND_TO_SQUARE: Record<CornerName, Point> = { Top: [0, 1], Right: [1, 1], Bottom: [1, 0], Left: [0, 0] };
export type AffineMatrix = [[number, number, number], [number, number, number]];
export type AffinePair = { inv: AffineMatrix; fwd: AffineMatrix };
export const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
export function solveAffine(src: Point[], dst: Point[]): AffineMatrix { const [s1,s2,s3]=src,[d1,d2,d3]=dst; const det=(a:number,b:number,c:number,d:number)=>a*d-b*c; const A=[[s1[0],s1[1],1],[s2[0],s2[1],1],[s3[0],s3[1],1]]; const inv3=(m:number[][])=>{const [a,b,c]=m[0],[d,e,f]=m[1],[g,h,i]=m[2]; const D=a*det(e,f,h,i)-b*det(d,f,g,i)+c*det(d,e,g,h); if(Math.abs(D)<1e-9) throw new Error('singular'); return [[det(e,f,h,i)/D,det(c,b,i,h)/D,det(b,c,e,f)/D],[det(f,d,i,g)/D,det(a,c,g,i)/D,det(c,a,f,d)/D],[det(d,e,g,h)/D,det(b,a,h,g)/D,det(a,b,d,e)/D]]}; const IA=inv3(A); const mul=(M:number[][],v:number[])=>[M[0][0]*v[0]+M[0][1]*v[1]+M[0][2]*v[2],M[1][0]*v[0]+M[1][1]*v[1]+M[1][2]*v[2],M[2][0]*v[0]+M[2][1]*v[1]+M[2][2]*v[2]]; const ux=mul(IA,[d1[0],d2[0],d3[0]]), uy=mul(IA,[d1[1],d2[1],d3[1]]); return [[ux[0],ux[1],ux[2]],[uy[0],uy[1],uy[2]]]; }
export const applyAffine=(m:AffineMatrix,a:number,b:number):Point=>[m[0][0]*a+m[0][1]*b+m[0][2],m[1][0]*a+m[1][1]*b+m[1][2]];
export function computeAffine(corners: Record<CornerName, Point>): AffinePair { const src=CORNER_ORDER.map((k)=>corners[k]); const dst=CORNER_ORDER.map((k)=>DIAMOND_TO_SQUARE[k]); return { inv: solveAffine(src,dst), fwd: solveAffine(dst,src)}; }
export const fallbackCorners=(w:number,h:number):Record<CornerName,Point>=>({Top:[(w-1)*0.5,0],Right:[w-1,(h-1)*0.5],Bottom:[(w-1)*0.5,h-1],Left:[0,(h-1)*0.5]});
