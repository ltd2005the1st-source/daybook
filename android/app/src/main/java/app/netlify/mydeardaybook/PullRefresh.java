package app.netlify.mydeardaybook;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.os.SystemClock;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.animation.DecelerateInterpolator;
import android.widget.FrameLayout;

/**
 * Swipe down from the top to reload, like most Android apps. Framework only (no AndroidX).
 *
 * A pull only starts when the page itself is at the very top and the page says the finger landed
 * somewhere a pull makes sense (not inside a scrolled panel, an open sheet, or a calendar drag).
 * The page reports that through {@link #setPageAllows(boolean)} on every touch.
 */
class PullRefresh extends FrameLayout {
    interface Listener { void onRefresh(); }

    private static final long PAGE_WAIT_MS = 150; // how long to wait for the page's answer
    private static final float TRIGGER_DP = 80, MAX_DP = 130, SIZE_DP = 40, REST_DP = 16;

    private final View web;
    private final float density, slop;
    private final Paint disc = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint arc = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint shade = new Paint(Paint.ANTI_ALIAS_FLAG); // soft ring under the disc
    private final RectF box = new RectF();

    private Listener listener;
    private volatile int pageAllows = -1; // -1 unknown for this touch, 0 no, 1 yes
    private float startX, startY, lastY;
    private long downAt;
    private boolean dragging, refreshing;
    private float offset; // how far the indicator has come down, in px
    private float spin;
    private ValueAnimator settle;
    private int accent = Color.parseColor("#E0583F"), surface = Color.WHITE;

    PullRefresh(Context ctx, View web) {
        super(ctx);
        this.web = web;
        density = ctx.getResources().getDisplayMetrics().density;
        slop = ViewConfiguration.get(ctx).getScaledTouchSlop();
        addView(web, new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));
        setWillNotDraw(false);
        arc.setStyle(Paint.Style.STROKE);
        arc.setStrokeCap(Paint.Cap.ROUND);
        arc.setStrokeWidth(3 * density);
        setDark(false);
    }

    void setListener(Listener l) { listener = l; }

    void setDark(boolean dark) {
        surface = dark ? Color.parseColor("#2A2A28") : Color.WHITE;
        disc.setColor(surface);
        shade.setColor(dark ? 0x55000000 : 0x22000000);
        invalidate();
    }

    /** Called by the page on each touch start (from the JavaBridge thread). */
    void setPageAllows(boolean ok) { pageAllows = ok ? 1 : 0; }

    /** A new page started loading: until it reports, only the native top check applies. */
    void resetPage() { pageAllows = -1; }

    boolean isRefreshing() { return refreshing; }

    /** The reload finished (or failed): tuck the indicator away. */
    void done() {
        if (!refreshing) return;
        refreshing = false;
        animateTo(0);
    }

    private boolean mayPull() {
        if (refreshing || web.canScrollVertically(-1)) return false;
        int p = pageAllows;
        if (p == 1) return true;
        if (p == 0) return false;
        // The page hasn't answered (still loading, or not our page): allow after a short wait.
        return SystemClock.uptimeMillis() - downAt > PAGE_WAIT_MS;
    }

    @Override
    public boolean onInterceptTouchEvent(MotionEvent e) {
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                startX = e.getX(); startY = lastY = e.getY();
                downAt = SystemClock.uptimeMillis();
                pageAllows = -1;
                dragging = false;
                return false;
            case MotionEvent.ACTION_POINTER_DOWN:
                pageAllows = 0; // pinch zoom, not a pull
                return false;
            case MotionEvent.ACTION_MOVE: {
                if (dragging) return true;
                float dy = e.getY() - startY, dx = Math.abs(e.getX() - startX);
                if (dy > slop && dy > dx * 1.5f && mayPull()) {
                    dragging = true;
                    lastY = e.getY();
                    if (settle != null) settle.cancel();
                    getParent().requestDisallowInterceptTouchEvent(true);
                    return true;
                }
                return false;
            }
            default:
                return false;
        }
    }

    @Override
    public boolean onTouchEvent(MotionEvent e) {
        if (!dragging) return false;
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_MOVE: {
                float dy = e.getY() - lastY;
                lastY = e.getY();
                // Resistance: the further it's pulled, the harder it gets.
                float max = MAX_DP * density;
                float k = 0.55f * (1 - Math.min(offset / max, 1) * 0.6f);
                offset = Math.max(0, Math.min(max, offset + dy * k));
                invalidate();
                return true;
            }
            case MotionEvent.ACTION_UP:
                dragging = false;
                if (offset >= TRIGGER_DP * density) {
                    refreshing = true;
                    animateTo(TRIGGER_DP * density * 0.85f);
                    if (listener != null) listener.onRefresh();
                } else {
                    animateTo(0);
                }
                return true;
            case MotionEvent.ACTION_CANCEL:
                dragging = false;
                animateTo(0);
                return true;
            default:
                return true;
        }
    }

    private void animateTo(float target) {
        if (settle != null) settle.cancel();
        settle = ValueAnimator.ofFloat(offset, target);
        settle.setDuration(220);
        settle.setInterpolator(new DecelerateInterpolator());
        settle.addUpdateListener(a -> { offset = (float) a.getAnimatedValue(); invalidate(); });
        settle.start();
    }

    @Override
    protected void dispatchDraw(Canvas c) {
        super.dispatchDraw(c);
        if (offset <= 0.5f && !refreshing) return;
        float size = SIZE_DP * density, r = size / 2;
        float trigger = TRIGGER_DP * density;
        float progress = Math.min(offset / trigger, 1);
        float cx = getWidth() / 2f;
        float cy = offset - size + REST_DP * density * progress;
        if (cy + r < 0) return;

        c.drawCircle(cx, cy + density, r + 1.5f * density, shade);
        c.drawCircle(cx, cy, r, disc);

        float ar = r * 0.48f;
        box.set(cx - ar, cy - ar, cx + ar, cy + ar);
        arc.setColor(accent);
        if (refreshing) {
            spin = (spin + 9) % 360;
            float sweep = 200 + 70 * (float) Math.sin(SystemClock.uptimeMillis() / 260.0);
            arc.setAlpha(255);
            c.drawArc(box, spin, sweep, false, arc);
            postInvalidateOnAnimation();
        } else {
            // Fills in as you pull; fully drawn (and solid) once letting go will refresh.
            arc.setAlpha(progress >= 1 ? 255 : 110);
            c.drawArc(box, -90 + offset * 0.8f, 300 * progress, false, arc);
        }
    }
}
