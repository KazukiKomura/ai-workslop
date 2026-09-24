# -*- coding: utf-8 -*-
"""Sample-size tables for the between-subjects v8 design (1 case per participant). Normal-approximation power; no external packages.
Usage: python3 tools/power-v8.py > docs/POWER-v8-tables.md"""
import math
def Phi(x): return 0.5*(1+math.erf(x/math.sqrt(2)))
def z(p):
    lo,hi=-10,10
    for _ in range(200):
        mid=(lo+hi)/2
        if Phi(mid)<p: lo=mid
        else: hi=mid
    return (lo+hi)/2
def n_two_group(d,alpha=0.05,power=0.8,onesided=True):
    za=z(1-alpha) if onesided else z(1-alpha/2); zb=z(power)
    return math.ceil(2*((za+zb)/d)**2)
def n_two_prop(p0,p1,alpha=0.05,power=0.8,onesided=True):
    za=z(1-alpha) if onesided else z(1-alpha/2); zb=z(power); pbar=(p0+p1)/2
    num=(za*math.sqrt(2*pbar*(1-pbar))+zb*math.sqrt(p0*(1-p0)+p1*(1-p1)))**2
    return math.ceil(num/(p0-p1)**2)
def power_two_group(n,d,alpha=0.05,onesided=True):
    za=z(1-alpha) if onesided else z(1-alpha/2); return Phi(d*math.sqrt(n/2)-za)
print('## 予備実験（MC検証、文書4条件、開示は均等配分・非分析）\n')
print('### 同意評定の目標項目：操作条件 対 基準（1群あたり）\n')
print('| 群間の差（7件法） | d（SD1.5） | 片側α=.05, 検出力.8 | 検出力.9 | α=.05/3（3比較）, 検出力.8 |')
print('|---|---|---|---|---|')
for diff in [0.7,1.0,1.2,1.5]:
    d=diff/1.5
    print(f'| {diff} | {d:.2f} | {n_two_group(d)} | {n_two_group(d,power=0.9)} | {n_two_group(d,alpha=0.05/3)} |')
print('\n### 事実型MCの意図一致率：操作条件 対 基準（1群あたり）\n')
print('| 基準条件の一致率 | 操作条件の一致率 | 片側α=.05, 検出力.8 | 検出力.9 |')
print('|---|---|---|---|')
for p0,p1 in [(0.9,0.6),(0.9,0.7),(0.85,0.6),(0.85,0.7)]:
    print(f'| {p0} | {p1} | {n_two_prop(p0,p1)} | {n_two_prop(p0,p1,power=0.9)} |')
print('\n### 1群30人・35人・40人で拾える差（片側α=.05）\n')
print('| 1群の人数 | 差0.7の検出力 | 差1.0 | 差1.2 | 差1.0（α=.05/3） |')
print('|---|---|---|---|---|')
for n in [25,30,35,40,50]:
    print(f'| {n} | {power_two_group(n,0.7/1.5):.2f} | {power_two_group(n,1.0/1.5):.2f} | {power_two_group(n,1.2/1.5):.2f} | {power_two_group(n,1.0/1.5,alpha=0.05/3):.2f} |')
print('\n## 本実験（参加者間、文書4条件×開示2条件）\n')
print('### 主要結果 S（十分さ）の文書条件の主効果：操作 対 基準（1群あたり、両側α=.05）\n')
print('| d | 検出力.8 | 検出力.9 | α=.05/3（3比較）, 検出力.8 |')
print('|---|---|---|---|')
for d in [0.3,0.4,0.5]:
    print(f'| {d} | {n_two_group(d,onesided=False)} | {n_two_group(d,power=0.9,onesided=False)} | {n_two_group(d,alpha=0.05/3,onesided=False)} |')
print('\n### 開示×文書条件の交互作用（2×2の差の差、効果 d_int、1セルあたり、両側α=.05）\n')
print('| d_int | 検出力.8（1セル） | 4セル合計 |')
print('|---|---|---|')
for d in [0.25,0.3,0.4]:
    n=math.ceil(4*((z(0.975)+z(0.8))/d)**2)  # difference of differences: var = 4σ²/n per cell
    print(f'| {d} | {n} | {4*n} |')
