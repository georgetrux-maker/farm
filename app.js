/**
 * AURA FASHION AI - APPLICATION CONTROLLER
 * Compliant with taste-skill (Zero em-dashes, cold luxury palette, organic data)
 */

document.addEventListener('DOMContentLoaded', () => {

  // =========================================================================
  // 1. STATE & REFERENCES
  // =========================================================================
  const state = {
    activeView: 'shopper',
    credits: 2850,
    likes: 2400,
    isLiked: false,
    zoom: 1,
    isPipelineRunning: false,
    activeProfile: 'pear',
    subtitles: [
      'Chất voan tơ 2 lớp này hack dáng cực đỉnh luôn mọi người ơi...',
      'Điểm cộng lớn nhất là phần chiết eo giấu bụng mỡ siêu khéo!',
      'Cổ vuông khoe xương quai xanh thanh lịch, mặc đi làm hay đi tiệc đều sang.',
      'Bạn nào từ 1m55 đến 1m65 mặc chiều dài qua gối cực kỳ tôn chân nha!'
    ],
    subIndex: 0
  };

  // Tabs & Views
  const tabShopper = document.getElementById('tab-shopper');
  const tabWorkflow = document.getElementById('tab-workflow');
  const tabSync = document.getElementById('tab-sync');

  const viewShopper = document.getElementById('view-shopper-container');
  const viewWorkflow = document.getElementById('view-workflow-container');
  const viewSync = document.getElementById('view-sync-container');

  const btnMasterRun = document.getElementById('btn-master-run');
  const headerCredits = document.getElementById('header-credits');

  // Shopper Player elements
  const btnMagicTryonCenter = document.getElementById('btn-magic-tryon-center');
  const btnOpenFittingRoom = document.getElementById('btn-open-fitting-room');
  const modalFittingRoom = document.getElementById('modal-fitting-room');
  const btnCloseFitting = document.getElementById('btn-close-fitting');
  const btnQuickBuy = document.getElementById('btn-quick-buy');
  const drawerBuySheet = document.getElementById('drawer-buy-sheet');
  const btnCloseBuy = document.getElementById('btn-close-buy');

  const subtitlesAnimatedText = document.getElementById('subtitles-animated-text');
  const btnLikeVideo = document.getElementById('btn-like-video');
  const likeCounter = document.getElementById('like-counter');
  const btnBookmark = document.getElementById('btn-bookmark');
  const btnShare = document.getElementById('btn-share');
  const btnSoundToggle = document.getElementById('btn-sound-toggle');
  const soundIcon = document.getElementById('sound-icon');

  // Virtual Fitting elements
  const profileTabs = document.querySelectorAll('.profile-tab');
  const imgAfterTryon = document.getElementById('img-after-tryon');
  const sliderBeforeWrapper = document.getElementById('slider-before-wrapper');
  const interactiveDivider = document.getElementById('interactive-divider');
  const statBellyFit = document.getElementById('stat-belly-fit');
  const statRecommendedSize = document.getElementById('stat-recommended-size');
  const statFitNote = document.getElementById('stat-fit-note');
  const btnSaveFitting = document.getElementById('btn-save-fitting');
  const btnConfirmOrder = document.getElementById('btn-confirm-order');

  // Workflow Canvas elements
  const wfViewport = document.getElementById('workflow-viewport');
  const wfNodesBoard = document.getElementById('wf-nodes-board');
  const wfInspectorSidebar = document.getElementById('wf-inspector-sidebar');
  const wfInspectorHeading = document.getElementById('wf-inspector-heading');
  const wfInspectorBody = document.getElementById('wf-inspector-body');
  const btnWfCloseInspector = document.getElementById('btn-wf-close-inspector');
  const btnWfSaveInspector = document.getElementById('btn-wf-save-inspector');
  const btnWfPreviewShopper = document.getElementById('btn-wf-preview-shopper');
  const btnAddNode = document.getElementById('btn-add-node');
  const pipelineLiveStatus = document.getElementById('pipeline-live-status');
  const pipelineLiveStep = document.getElementById('pipeline-live-step');

  // =========================================================================
  // 2. VIEW SWITCHING
  // =========================================================================
  function switchView(target) {
    state.activeView = target;

    [tabShopper, tabWorkflow, tabSync].forEach(tab => {
      tab.classList.remove('active');
      tab.classList.add('text-muted');
    });

    [viewShopper, viewWorkflow, viewSync].forEach(pane => {
      pane.classList.remove('active');
    });

    if (target === 'shopper') {
      tabShopper.classList.add('active');
      tabShopper.classList.remove('text-muted');
      viewShopper.classList.add('active');
    } else if (target === 'workflow') {
      tabWorkflow.classList.add('active');
      tabWorkflow.classList.remove('text-muted');
      viewWorkflow.classList.add('active');
      setTimeout(updateWorkflowCables, 80);
    } else if (target === 'sync') {
      tabSync.classList.add('active');
      tabSync.classList.remove('text-muted');
      viewSync.classList.add('active');
    }
  }

  tabShopper.addEventListener('click', () => switchView('shopper'));
  tabWorkflow.addEventListener('click', () => switchView('workflow'));
  tabSync.addEventListener('click', () => switchView('sync'));

  if (btnWfPreviewShopper) {
    btnWfPreviewShopper.addEventListener('click', () => {
      switchView('shopper');
      showToast('Đã chuyển sang chế độ Xem Video & Thử Đồ.');
    });
  }

  // =========================================================================
  // 3. SHOPPER & FITTING ROOM
  // =========================================================================
  function openFittingModal() {
    modalFittingRoom.classList.add('open');
  }
  function closeFittingModal() {
    modalFittingRoom.classList.remove('open');
  }

  btnMagicTryonCenter.addEventListener('click', openFittingModal);
  if (btnOpenFittingRoom) btnOpenFittingRoom.addEventListener('click', openFittingModal);
  btnCloseFitting.addEventListener('click', closeFittingModal);

  btnQuickBuy.addEventListener('click', () => drawerBuySheet.classList.add('open'));
  btnCloseBuy.addEventListener('click', () => drawerBuySheet.classList.remove('open'));

  // Body Profile Switching
  const profiles = {
    pear: {
      img: 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=720&q=80',
      belly: '98% Rất tốt',
      size: 'SIZE M (Chuẩn)',
      note: '"Dáng quả lê của bạn khi mặc đầm này sẽ tôn vòng 1 và che trọn phần bắp đùi to."'
    },
    hourglass: {
      img: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=720&q=80',
      belly: '100% Hoàn hảo',
      size: 'SIZE S (Tôn dáng)',
      note: '"Dáng đồng hồ cát tôn trọn đường cong eo 64cm, tùng váy rủ mềm cực kỳ nữ tính."'
    },
    petite: {
      img: 'https://images.unsplash.com/photo-1509967419530-da38b4704bc6?auto=format&fit=crop&w=720&q=80',
      belly: '95% Thoải mái',
      size: 'SIZE S (Vừa xinh)',
      note: '"Dáng mi nhon 1m52 mặc đầm dài qua bắp chân, ăn gian chiều cao thêm 4-5cm."'
    }
  };

  profileTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      profileTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const pKey = tab.getAttribute('data-profile');
      state.activeProfile = pKey;
      const data = profiles[pKey];

      if (data) {
        imgAfterTryon.src = data.img;
        statBellyFit.textContent = data.belly;
        statRecommendedSize.textContent = data.size;
        statFitNote.textContent = data.note;

        // Call real backend size advisor API
        const metrics = pKey === 'pear' ? { height: 158, weight: 51, body_shape: 'pear' }
                      : pKey === 'hourglass' ? { height: 165, weight: 52, body_shape: 'hourglass' }
                      : { height: 152, weight: 44, body_shape: 'petite' };
        fetch('/api/size/recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(metrics)
        })
        .then(r => r.json())
        .then(res => {
          if (res.status === 'success') {
            statRecommendedSize.textContent = `SIZE ${res.recommended_size} (Chuẩn)`;
            statFitNote.textContent = res.fit_note;
          }
        })
        .catch(err => console.log('Size API note:', err));
      }
    });
  });

  // Split Slider
  let isSliding = false;
  function setSliderPosition(percent) {
    const clamped = Math.max(5, Math.min(95, percent));
    interactiveDivider.style.left = `${clamped}%`;
    sliderBeforeWrapper.style.width = `${clamped}%`;
  }

  interactiveDivider.addEventListener('mousedown', () => isSliding = true);
  window.addEventListener('mouseup', () => isSliding = false);

  window.addEventListener('mousemove', (e) => {
    if (!isSliding) return;
    const parentRect = sliderBeforeWrapper.parentElement.getBoundingClientRect();
    const x = e.clientX - parentRect.left;
    const pct = (x / parentRect.width) * 100;
    setSliderPosition(pct);
  });

  interactiveDivider.addEventListener('touchstart', () => isSliding = true, { passive: true });
  window.addEventListener('touchend', () => isSliding = false);
  window.addEventListener('touchmove', (e) => {
    if (!isSliding) return;
    const touch = e.touches[0];
    const parentRect = sliderBeforeWrapper.parentElement.getBoundingClientRect();
    const x = touch.clientX - parentRect.left;
    const pct = (x / parentRect.width) * 100;
    setSliderPosition(pct);
  }, { passive: true });

  // Subtitle loop
  setInterval(() => {
    state.subIndex = (state.subIndex + 1) % state.subtitles.length;
    subtitlesAnimatedText.innerHTML = `"${state.subtitles[state.subIndex]}"`;
  }, 4200);

  // Social actions
  btnLikeVideo.addEventListener('click', () => {
    state.isLiked = !state.isLiked;
    state.likes += state.isLiked ? 1 : -1;
    likeCounter.textContent = `${(state.likes / 1000).toFixed(1)}k`;
    btnLikeVideo.querySelector('svg').classList.toggle('text-rose-500', state.isLiked);
    showToast(state.isLiked ? 'Đã thích video lookbook.' : 'Đã bỏ thích.');
  });

  btnBookmark.addEventListener('click', () => showToast('Đã lưu set đồ vào tủ đồ cá nhân.'));
  btnShare.addEventListener('click', () => showToast('Đã sao chép liên kết chia sẻ.'));

  let isMuted = false;
  btnSoundToggle.addEventListener('click', () => {
    isMuted = !isMuted;
    soundIcon.textContent = isMuted ? '🔇' : '🔊';
    showToast(isMuted ? 'Đã tắt tiếng' : 'Đã bật âm thanh review.');
  });

  document.querySelectorAll('.hotspot-pin').forEach(pin => {
    pin.addEventListener('click', () => {
      const info = pin.getAttribute('data-info');
      showToast(info);
    });
  });

  btnSaveFitting.addEventListener('click', () => {
    showToast('Đã lưu ảnh thử đồ vào Tủ Đồ Ảo.');
    closeFittingModal();
  });

  btnConfirmOrder.addEventListener('click', () => {
    closeFittingModal();
    drawerBuySheet.classList.add('open');
  });

  // =========================================================================
  // 4. WORKFLOW PIPELINE & BEZIER PHYSICS
  // =========================================================================
  function getPortPosition(portEl) {
    const rect = portEl.getBoundingClientRect();
    const boardRect = wfNodesBoard.getBoundingClientRect();
    return {
      x: (rect.left + rect.width / 2 - boardRect.left) / state.zoom,
      y: (rect.top + rect.height / 2 - boardRect.top) / state.zoom
    };
  }

  function drawBezierCable(cableId, outPortId, inPortId) {
    const path = document.getElementById(cableId);
    const outPort = document.querySelector(`[data-port="${outPortId}"]`);
    const inPort = document.querySelector(`[data-port="${inPortId}"]`);

    if (!path || !outPort || !inPort) return;

    const p1 = getPortPosition(outPort);
    const p2 = getPortPosition(inPort);

    let cx1, cy1, cx2, cy2;
    if (p2.x >= p1.x) {
      const dx = Math.max(50, (p2.x - p1.x) * 0.5);
      cx1 = p1.x + dx;
      cy1 = p1.y;
      cx2 = p2.x - dx;
      cy2 = p2.y;
    } else {
      const offset = 65;
      const midY = p1.y + (p2.y - p1.y) * 0.5;
      cx1 = p1.x + offset;
      cy1 = midY;
      cx2 = p2.x - offset;
      cy2 = midY;
    }

    const d = `M ${p1.x} ${p1.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${p2.x} ${p2.y}`;
    path.setAttribute('d', d);
  }

  function updateWorkflowCables() {
    drawBezierCable('wf-cable-1', 'out-1', 'in-2');
    drawBezierCable('wf-cable-2', 'out-2', 'in-3');
    drawBezierCable('wf-cable-3', 'out-3', 'in-4');
    drawBezierCable('wf-cable-4', 'out-4', 'in-5');
    drawBezierCable('wf-cable-5', 'out-5', 'in-6');
  }

  window.addEventListener('resize', updateWorkflowCables);

  // Dragging nodes
  const wfNodes = document.querySelectorAll('.workflow-node');
  wfNodes.forEach(node => {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initLeft = 0;
    let initTop = 0;

    node.addEventListener('mousedown', (e) => {
      if (e.target.closest('button') || e.target.closest('.node-port')) return;

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      initLeft = parseFloat(node.style.left) || 0;
      initTop = parseFloat(node.style.top) || 0;
      node.style.zIndex = '50';

      function onMouseMove(me) {
        if (!isDragging) return;
        const dx = (me.clientX - startX) / state.zoom;
        const dy = (me.clientY - startY) / state.zoom;
        node.style.left = `${Math.max(10, initLeft + dx)}px`;
        node.style.top = `${Math.max(10, initTop + dy)}px`;
        updateWorkflowCables();
      }

      function onMouseUp() {
        if (isDragging) {
          isDragging = false;
          node.style.zIndex = '10';
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        }
      }

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });

    node.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const id = node.getAttribute('data-node-id');
      openWfInspector(id);
    });
  });

  // Node Inspector Configuration
  const inspectorConfigs = {
    '1': {
      title: 'Node 1: Nhập Sản Phẩm',
      fields: [
        { label: 'Tên Trang Phục', type: 'text', val: 'Đầm Voan Tơ 2 Lớp Hoa Nhí' },
        { label: 'Link Sản Phẩm', type: 'text', val: 'https://shopee.vn/product/1298402/dam-voan' },
        { label: 'Giá Bán', type: 'text', val: '189.000đ' }
      ]
    },
    '2': {
      title: 'Node 2: Bóc Tách Vải (SAM 2)',
      fields: [
        { label: 'Độ Nhạy Nếp Gấp', type: 'range', val: '96', min: '50', max: '100' },
        { label: 'Bảo Toàn Hoạ Tiết 4K', type: 'checkbox', checked: true, text: 'Giữ nét hoạ tiết hoa nhí' }
      ]
    },
    '3': {
      title: 'Node 3: Mẫu AI (IDM-VTON)',
      fields: [
        { label: 'Chọn Mẫu Độc Quyền', type: 'select', options: ['Linh Đan (1m62, Á Đông)', 'Chloe Nguyen (1m66, Cá Tính)', 'Bảo Châu (1m68, Thanh Lịch)'] },
        { label: 'Độ Ôm Form', type: 'range', val: '85', min: '30', max: '100' }
      ]
    },
    '4': {
      title: 'Node 4: Video Catwalk (Kling)',
      fields: [
        { label: 'Kiểu Chuyển Động', type: 'select', options: ['Sải bước dạo phố + Xoay 360°', 'Catwalk sàn diễn cao cấp', 'Đứng pose dáng nhẹ nhàng'] },
        { label: 'Tỉ Lệ Khung Hình', type: 'select', options: ['9:16 Dọc (TikTok/Reels)', '1:1 Vuông (Instagram)'] }
      ]
    },
    '5': {
      title: 'Node 5: Giọng Đọc & Subtitles',
      fields: [
        { label: 'KOC Lồng Tiếng', type: 'select', options: ['Mai Anh (Nữ Hà Nội Gen Z)', 'Lan Khuê (Nữ Sài Gòn)', 'Hải Nam (Nam Hà Nội)'] },
        { label: 'Tốc Độ Đọc', type: 'range', val: '1.1', min: '0.8', max: '1.5', step: '0.1' }
      ]
    },
    '6': {
      title: 'Node 6: Xuất Bản Tương Tác',
      fields: [
        { label: 'Nút [Thử Lên Tôi]', type: 'checkbox', checked: true, text: 'Bật thử đồ ảo tức thì' },
        { label: 'Mã Giảm Giá', type: 'text', val: 'AURA30K (Giảm 30.000đ)' }
      ]
    }
  };

  function openWfInspector(nodeId) {
    const cfg = inspectorConfigs[nodeId];
    if (!cfg) return;

    wfInspectorHeading.textContent = cfg.title;
    wfInspectorBody.innerHTML = '';

    cfg.fields.forEach(f => {
      const div = document.createElement('div');
      div.className = 'space-y-1.5';
      div.innerHTML = `<label class="text-[11px] font-semibold text-muted block">${f.label}</label>`;

      if (f.type === 'text') {
        div.innerHTML += `<input type="text" value="${f.val}" class="w-full px-3 py-2 rounded-lg bg-surface border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-accent">`;
      } else if (f.type === 'select') {
        const options = f.options.map(opt => `<option value="${opt}">${opt}</option>`).join('');
        div.innerHTML += `<select class="w-full px-3 py-2 rounded-lg bg-surface border border-white/10 text-white text-xs focus:outline-none focus:border-accent">${options}</select>`;
      } else if (f.type === 'range') {
        div.innerHTML += `<div class="flex items-center gap-3"><input type="range" min="${f.min}" max="${f.max}" value="${f.val}" step="${f.step || 1}" class="w-full accent-accent"><span class="font-mono text-accent text-xs">${f.val}</span></div>`;
      } else if (f.type === 'checkbox') {
        div.innerHTML += `<label class="flex items-center gap-2 cursor-pointer pt-1"><input type="checkbox" ${f.checked ? 'checked' : ''} class="w-4 h-4 accent-accent rounded"><span class="text-xs text-pearl">${f.text}</span></label>`;
      }

      wfInspectorBody.appendChild(div);
    });

    wfInspectorSidebar.classList.add('open');
  }

  btnWfCloseInspector.addEventListener('click', () => wfInspectorSidebar.classList.remove('open'));
  btnWfSaveInspector.addEventListener('click', () => {
    wfInspectorSidebar.classList.remove('open');
    showToast('Đã lưu cấu hình Node thành công.');
  });

  // Canvas zoom
  const wfZoomIn = document.getElementById('wf-zoom-in');
  const wfZoomOut = document.getElementById('wf-zoom-out');
  const wfResetView = document.getElementById('wf-reset-view');

  if (wfZoomIn) {
    wfZoomIn.addEventListener('click', () => {
      state.zoom = Math.min(1.4, state.zoom + 0.1);
      wfNodesBoard.style.transform = `scale(${state.zoom})`;
      wfNodesBoard.style.transformOrigin = '0 0';
      updateWorkflowCables();
    });
  }
  if (wfZoomOut) {
    wfZoomOut.addEventListener('click', () => {
      state.zoom = Math.max(0.65, state.zoom - 0.1);
      wfNodesBoard.style.transform = `scale(${state.zoom})`;
      wfNodesBoard.style.transformOrigin = '0 0';
      updateWorkflowCables();
    });
  }
  if (wfResetView) {
    wfResetView.addEventListener('click', () => {
      state.zoom = 1;
      wfNodesBoard.style.transform = 'scale(1)';
      wfViewport.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
      updateWorkflowCables();
    });
  }

  if (btnAddNode) {
    btnAddNode.addEventListener('click', () => {
      showToast('Có thể bổ sung thêm các node Upscale 4K hoặc Voice Clone từ thư viện.');
    });
  }

  // =========================================================================
  // 5. MASTER PIPELINE EXECUTION (Connected to Real Backend Task Queue)
  // =========================================================================
  btnMasterRun.addEventListener('click', runMasterPipeline);
  const btnSyncRunAgain = document.getElementById('btn-sync-run-again');
  if (btnSyncRunAgain) btnSyncRunAgain.addEventListener('click', runMasterPipeline);

  async function runMasterPipeline() {
    if (state.isPipelineRunning) return;
    state.isPipelineRunning = true;

    btnMasterRun.classList.add('opacity-75', 'pointer-events-none');
    pipelineLiveStatus.classList.remove('hidden');
    pipelineLiveStatus.classList.add('flex');
    pipelineLiveStep.textContent = 'Đang khởi tạo job trong hàng đợi...';

    try {
      // Call Real Backend API
      const res = await fetch('/api/pipeline/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: 'user_linh_chi', product_id: 'prod_dam_voan_to' })
      });
      const data = await res.json();

      if (data.status === 'success') {
        const jobId = data.job_id;
        headerCredits.textContent = `${data.remaining_credits.toLocaleString()} Cr`;
        showToast(`Job ${jobId} đã gửi vào hàng đợi xử lý.`);

        // Poll Real Job Status
        const pollInterval = setInterval(async () => {
          try {
            const jRes = await fetch(`/api/jobs/${jobId}`);
            const job = await jRes.json();

            pipelineLiveStep.textContent = `${job.current_step} (${job.progress}%)`;

            // Active node pulse according to progress
            wfNodes.forEach(n => n.classList.remove('active-pulse'));
            const activeNodeIndex = Math.min(6, Math.max(1, Math.ceil(job.progress / 18)));
            const nEl = document.getElementById(`wf-node-${activeNodeIndex}`);
            if (nEl) nEl.classList.add('active-pulse');

            // Cable active
            if (activeNodeIndex > 1) {
              const cable = document.getElementById(`wf-cable-${activeNodeIndex - 1}`);
              if (cable) cable.classList.add('active');
            }

            if (job.status === 'completed') {
              clearInterval(pollInterval);
              state.isPipelineRunning = false;
              btnMasterRun.classList.remove('opacity-75', 'pointer-events-none');
              pipelineLiveStatus.classList.add('hidden');
              pipelineLiveStatus.classList.remove('flex');
              wfNodes.forEach(n => n.classList.remove('active-pulse'));

              showToast('Pipeline hoàn tất! Video mới đã được tạo và đồng bộ.');

              // Flash video frame
              const screen = document.getElementById('shopper-video-screen');
              if (screen) {
                screen.parentElement.classList.add('ring-2', 'ring-accent');
                setTimeout(() => screen.parentElement.classList.remove('ring-2', 'ring-accent'), 1500);
              }
            } else if (job.status === 'failed') {
              clearInterval(pollInterval);
              state.isPipelineRunning = false;
              btnMasterRun.classList.remove('opacity-75', 'pointer-events-none');
              pipelineLiveStatus.classList.add('hidden');
              showToast('Lỗi xử lý job.');
            }
          } catch (err) {
            console.error('Polling error', err);
          }
        }, 700);

      } else {
        throw new Error(data.detail || 'Không thể tạo job');
      }
    } catch (e) {
      state.isPipelineRunning = false;
      btnMasterRun.classList.remove('opacity-75', 'pointer-events-none');
      pipelineLiveStatus.classList.add('hidden');
      showToast(`Lỗi: ${e.message}`);
    }
  }

  // =========================================================================
  // 6. TOAST NOTIFICATION
  // =========================================================================
  function showToast(msg) {
    let toast = document.getElementById('aura-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'aura-toast';
      toast.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-surface/95 text-white text-xs font-semibold border border-white/15 shadow-xl backdrop-blur-md flex items-center gap-2 transition-all transform opacity-0 translate-y-3';
      document.body.appendChild(toast);
    }

    toast.innerHTML = `<span class="w-2 h-2 rounded-full bg-accent"></span> ${msg}`;
    toast.classList.remove('opacity-0', 'translate-y-3');
    toast.classList.add('opacity-100', 'translate-y-0');

    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.remove('opacity-100', 'translate-y-0');
      toast.classList.add('opacity-0', 'translate-y-3');
    }, 2600);
  }

});
