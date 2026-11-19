import {useEffect,useState} from 'react';
import {Sparkles,RotateCcw,Check,Camera} from 'lucide-react';
import {materials} from './model';
import {tr,num as fmt} from './settings';
import {useAdminCatalog} from './adminCatalog';

export interface PhotoAnalysisResult {
  primaryIndex: number;
  secondaryIndex?: number;
  confidence: number;
  suggestedKg: [number, number, number, number];
  summaryLabel: string;
}

const HOUSEHOLD_PRESETS: Array<{
  id: string;
  label: string;
  materialIndex: number;
  kg: number;
}> = [
  {id: 'pet-bag', label: '🧴 1 bao chai nhựa (~3 kg)', materialIndex: 0, kg: 3},
  {id: 'carton-stack', label: '📦 1 chồng thùng carton (~5 kg)', materialIndex: 1, kg: 5},
  {id: 'paper-bundle', label: '📰 1 bó sách báo cũ (~2.5 kg)', materialIndex: 1, kg: 2.5},
  {id: 'can-crate', label: '🥫 1 thùng vỏ lon (~0.5 kg)', materialIndex: 2, kg: 0.5},
  {id: 'metal-scrap', label: '🔧 Sắt / nhôm vụn (~2 kg)', materialIndex: 2, kg: 2},
  {id: 'glass-bottles', label: '🍾 1 két chai thủy tinh (~4 kg)', materialIndex: 3, kg: 4},
];

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}

async function analyzeScrapPhoto(file: File): Promise<PhotoAnalysisResult> {
  const name = file.name.toLowerCase();
  const scores = [0.2, 0.2, 0.2, 0.2]; // [Plastic, Paper, Metal, Glass]

  // Filename keyword hints (if user uploads a named photo)
  if (/(nhua|plastic|pet|chai|bottle|hdpe|can_nhua)/.test(name)) scores[0] += 1.5;
  if (/(giay|paper|carton|bia|sach|bao|cardboard)/.test(name)) scores[1] += 1.5;
  if (/(kim|metal|sat|nhom|dong|lon|alu|iron|copper|scrap)/.test(name)) scores[2] += 1.5;
  if (/(thuy|tinh|glass|lo|vo_chai_bia)/.test(name)) scores[3] += 1.5;

  // Analyze pixel color & contrast profile via offscreen canvas
  try {
    const bitmap = await createImageBitmap(file);
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', {willReadFrequently: true});
    if (ctx) {
      ctx.drawImage(bitmap, 0, 0, size, size);
      const {data} = ctx.getImageData(0, 0, size, size);
      let cardboardPixels = 0;
      let plasticPixels = 0;
      let metallicPixels = 0;
      let glassPixels = 0;
      const totalPixels = size * size;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const [h, s, v] = rgbToHsv(r, g, b);

        // Cardboard / brown kraft paper: hue 20..48, moderate saturation
        if (h >= 18 && h <= 50 && s >= 0.18 && s <= 0.68 && v >= 0.28 && v <= 0.88) {
          cardboardPixels++;
        }
        // Plastic (colorful PET/HDPE blue, cyan, red, bright white)
        if ((h >= 175 && h <= 245 && s >= 0.22) || (s >= 0.48 && v >= 0.45)) {
          plasticPixels++;
        }
        // Metal (low saturation grey/silver or copper/rust)
        if ((s < 0.18 && v >= 0.2 && v <= 0.78) || (h >= 8 && h <= 28 && s >= 0.35 && v < 0.65)) {
          metallicPixels++;
        }
        // Glass (greenish-teal tint or high-luminance specular reflection)
        if ((h >= 85 && h <= 168 && s >= 0.2 && v >= 0.25) || (s < 0.12 && v > 0.85)) {
          glassPixels++;
        }
      }

      scores[0] += (plasticPixels / totalPixels) * 2.4;
      scores[1] += (cardboardPixels / totalPixels) * 2.6;
      scores[2] += (metallicPixels / totalPixels) * 2.2;
      scores[3] += (glassPixels / totalPixels) * 2.1;
    }
    bitmap.close();
  } catch {
    // Fallback to balanced default if browser cannot decode bitmap
  }

  const ranked = scores
    .map((score, index) => ({index, score}))
    .sort((a, b) => b.score - a.score);

  const primary = ranked[0];
  const secondary = ranked[1];
  const totalScore = scores.reduce((a, b) => a + b, 0) || 1;
  // Share of sampled pixels whose colour matches the top material. A colour heuristic, not a trained model.
  const confidence = Math.round((primary.score / totalScore) * 100);

  const defaultKgByMat = [3.5, 5.0, 2.5, 4.0];
  const suggestedKg: [number, number, number, number] = [0, 0, 0, 0];
  suggestedKg[primary.index] = defaultKgByMat[primary.index];
  if (secondary.score > primary.score * 0.62) {
    suggestedKg[secondary.index] = Math.round(defaultKgByMat[secondary.index] * 0.5 * 10) / 10;
  }

  const primaryName = tr(materials[primary.index].name);
  const summaryLabel = secondary.score > primary.score * 0.62
    ? `${primaryName} + ${tr(materials[secondary.index].name)}`
    : primaryName;

  return {
    primaryIndex: primary.index,
    secondaryIndex: secondary.score > primary.score * 0.62 ? secondary.index : undefined,
    confidence,
    suggestedKg,
    summaryLabel,
  };
}

export function ScrapQuickPresets({
  weights,
  onChangeWeights,
}: {
  weights: string[];
  onChangeWeights: (next: string[]) => void;
}) {
  function addPreset(materialIndex: number, kg: number) {
    const next = weights.map((val, idx) => {
      if (idx !== materialIndex) return val;
      const cur = Math.max(0, Number(val) || 0);
      const sum = Math.min(1000, Math.round((cur + kg) * 1000) / 1000);
      return String(sum);
    });
    onChangeWeights(next);
  }

  const hasAny = weights.some(v => Number(v) > 0);

  return (
    <div className="pickup-callout" style={{margin: '10px 0', padding: '10px 12px'}}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px'}}>
        <strong>⚖️ {tr('Không có cân? Chạm chọn nhanh theo vật dụng quen thuộc:')}</strong>
        {hasAny && (
          <button
            type="button"
            className="text-link"
            onClick={() => onChangeWeights(['0', '0', '0', '0'])}
          >
            <RotateCcw size={13}/> {tr('Đặt lại 0 kg')}
          </button>
        )}
      </div>
      <div className="filter-tabs">
        {HOUSEHOLD_PRESETS.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => addPreset(p.materialIndex, p.kg)}
          >
            + {tr(p.label)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ScrapPhotoSmartBox({
  file,
  onApplyWeights,
}: {
  file?: File;
  onApplyWeights: (next: string[]) => void;
}) {
  const catalog = useAdminCatalog();
  const [previewUrl, setPreviewUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<PhotoAnalysisResult | null>(null);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreviewUrl('');
      setResult(null);
      setApplied(false);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setAnalyzing(true);
    setApplied(false);
    let active = true;

    const timer = setTimeout(() => {
      void analyzeScrapPhoto(file).then(res => {
        if (!active) return;
        setResult(res);
        setAnalyzing(false);
      });
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
    };
  }, [file]);

  if (!file) return null;

  const estVnd = result
    ? Math.round(result.suggestedKg.reduce((s, kg, i) => s + kg * (catalog.economics.buyVnd[i] ?? materials[i]?.buyVnd ?? 3500), 0))
    : 0;
  const estEco = result
    ? result.suggestedKg.reduce((s, kg, i) => s + kg * (materials[i]?.rate ?? 10), 0)
    : 0;

  return (
    <div
      className="pickup-callout"
      style={{
        margin: '10px 0',
        border: '1px solid rgba(16, 185, 129, 0.35)',
        background: 'rgba(16, 185, 129, 0.06)',
      }}
    >
      <div style={{display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap'}}>
        {previewUrl && (
          <img
            src={previewUrl}
            alt={tr('Ảnh lô phế liệu vừa chọn')}
            style={{width: '76px', height: '76px', objectFit: 'cover', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.08)'}}
          />
        )}
        <div style={{flex: 1, minWidth: '210px', display: 'grid', gap: '4px'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap'}}>
            <Sparkles size={15} color="#059669"/>
            <strong>
              {analyzing
                ? tr('Đang phân tích màu sắc ảnh chụp để gợi ý vật liệu & giá…')
                : tr('Gợi ý nhanh từ ảnh chụp: {label}', {label: result?.summaryLabel || ''})}
            </strong>
            {result && !analyzing && (
              <span className="web3-status-pill pill-green">
                {tr('Độ khớp màu {n}%', {n: result.confidence})}
              </span>
            )}
          </div>
          {result && !analyzing && (
            <small className="web-note">{tr('Gợi ý theo màu sắc ảnh, không phải mô hình AI. Khối lượng thật do người thu gom cân tại chỗ.')}</small>
          )}

          {result && !analyzing && (
            <>
              <p className="footnote" style={{margin: 0}}>
                {tr('Ước lượng gợi ý:')}{' '}
                <strong>
                  {result.suggestedKg
                    .map((kg, i) => (kg > 0 ? `${materials[i].symbol} ${tr(materials[i].name)} ${kg} kg` : ''))
                    .filter(Boolean)
                    .join(' · ')}
                </strong>
                {' · '}
                {tr('Giá gợi ý: ≈ {vnd} ₫ (+{eco} ECO)', {vnd: fmt(estVnd), eco: fmt(estEco)})}
              </p>
              <div style={{display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px', flexWrap: 'wrap'}}>
                <button
                  type="button"
                  className={applied ? 'secondary' : 'primary'}
                  onClick={() => {
                    onApplyWeights(result.suggestedKg.map(String));
                    setApplied(true);
                  }}
                >
                  {applied ? <><Check size={14}/> {tr('Đã điền gợi ý vào bảng cân')}</> : <><Camera size={14}/> {tr('Áp dụng gợi ý vào bảng cân')}</>}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
