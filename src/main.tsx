import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Không tìm thấy phần tử #root trong index.html.');
}

const root = createRoot(container);

function renderStartupError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : 'Không thể khởi tạo ứng dụng. Vui lòng tải lại trang.';

  root.render(
    createElement(
      'main',
      {
        role: 'alert',
        style: {
          minHeight: '100dvh',
          display: 'grid',
          placeContent: 'center',
          gap: '12px',
          padding: '24px',
          color: '#0f172a',
          background: '#f8fafc',
          fontFamily: 'system-ui, sans-serif',
        },
      },
      createElement('h1', { style: { margin: 0, fontSize: '20px' } }, 'Không thể khởi chạy Cloull'),
      createElement('p', { style: { maxWidth: '560px', margin: 0, lineHeight: 1.6 } }, message),
      createElement(
        'button',
        {
          type: 'button',
          onClick: () => window.location.reload(),
          style: {
            justifySelf: 'start',
            minHeight: '44px',
            padding: '0 16px',
            border: 0,
            background: '#1d4ed8',
            color: '#fff',
            cursor: 'pointer',
          },
        },
        'Tải lại ứng dụng'
      )
    )
  );
}

void import('./App')
  .then(({ default: App }) => {
    root.render(createElement(App));
  })
  .catch(renderStartupError);
