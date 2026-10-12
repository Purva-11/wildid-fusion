from transformers import PretrainedConfig


class MiewIdNetConfig(PretrainedConfig):
    model_type = "miewid"

    def __init__(self, n_classes=10, model_name='efficientnet_b0', use_fc=False, fc_dim=512, dropout=0.0, loss_module='softmax', s=30.0, margin=0.50, ls_eps=0.0, theta_zero=0.785, pretrained=True, margins=None, k=None, **kwargs):
        super().__init__(**kwargs)
        self.n_classes = n_classes
        self.model_name = model_name
        self.use_fc = use_fc
        self.fc_dim = fc_dim
        self.dropout = dropout
        self.loss_module = loss_module
        self.s = s
        self.margin = margin
        self.ls_eps = ls_eps
        self.theta_zero = theta_zero
        self.pretrained = pretrained
        self.margins = margins
        self.k = k