"""URL configuration for payments app."""
from django.urls import path
from .views import (
    PaymentUploadView,
    PaymentMyStatusView,
    PaymentMyHistoryView,
    PaymentOCRStatusView,
    PaymentConfirmView,
    PaymentQueueView,
    PaymentMonitoringView,
    PaymentDetailView,
    PaymentApproveView,
    PaymentRejectView,
    NotifyCoordinatorView,
    ReceiptFileView,
)

urlpatterns = [
    path('upload/',                                   PaymentUploadView.as_view(),       name='payment-upload'),
    path('receipt/',                                  ReceiptFileView.as_view(),         name='payment-receipt-file'),
    path('my-status/',                                PaymentMyStatusView.as_view(),     name='payment-my-status'),
    path('my-history/',                               PaymentMyHistoryView.as_view(),    name='payment-my-history'),
    path('my-payments/<uuid:pk>/ocr-status/',         PaymentOCRStatusView.as_view(),    name='payment-ocr-status'),
    path('my-payments/<uuid:pk>/confirm/',            PaymentConfirmView.as_view(),      name='payment-confirm'),
    path('queue/',                                    PaymentQueueView.as_view(),        name='payment-queue'),
    path('monitoring/',                               PaymentMonitoringView.as_view(),   name='payment-monitoring'),
    path('notify-coordinator/<uuid:bootcamper_id>/',  NotifyCoordinatorView.as_view(),   name='payment-notify-coordinator'),
    path('<uuid:pk>/approve/',                        PaymentApproveView.as_view(),      name='payment-approve'),
    path('<uuid:pk>/reject/',                         PaymentRejectView.as_view(),       name='payment-reject'),
    path('<uuid:pk>/',                                PaymentDetailView.as_view(),       name='payment-detail'),
]
