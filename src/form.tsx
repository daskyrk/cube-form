import React from "react";
import { get, set, cloneDeep, merge } from "lodash";
import { Input, Select, Form as NForm } from "antd";
import { FormSelect, FormInput } from "./form-item";
import { isPromise, useMount } from "./utils";

const CompMap = {};
const registComponent = ({ name, Component, ...rest }: any) => {
  CompMap[name] = Component(rest);
};
// registComponent('select', FormSelect);

export interface RegisterProps {
  fixIn(v: any): any;
  fixOut(v: any): any;
  requiredCheck(v: any): any;
}

// 1. 原始组件肯定要包装一下，调整value和onChange的参数，适配Form传入的配置
// 2. 注册的应该是包装后的组件，可以直接接受Form传来的配置
// 3. 这种注册写法，应该是对FormItem的一个封装
registComponent({
  name: "select",
  Component: FormSelect, // 某React组件，props中必须有value、onChange
  requiredCheck: value => {
    // 必填校验时，特殊的校验规则
    return [value !== undefined, "不能为空"];
  },
  fixOut: (value, options) => {
    // 在获取表单数据时，将React组件的value格式化成需要的格式
    return value;
  },
  fixIn: (value = "", options) => {
    // 从schema到React组件映射时，修正传入React组件的value
    return value;
  },
  extensionFix: (data, options) => {
    // 从schema到React组件映射时，修正传入React组件的配置项
    return data;
  }
  // event: { // 表单事件机制的eventName，所对应的React组件的事件名
  //   eventName: {
  //     handleName: 'onFocus',
  //   },
  // },
});
registComponent({
  name: "input",
  Component: FormInput, // 某React组件，props中必须有value、onChange
  requiredCheck: value => {
    // 必填校验时，特殊的校验规则
    return [value !== undefined && value !== "", "不能为空"];
  },
  fixOut: (value, options) => {
    // 在获取表单数据时，将React组件的value格式化成需要的格式
    return value;
  },
  fixIn: (value, options) => {
    // 从schema到React组件映射时，修正传入React组件的value
    return value;
  },
  extensionFix: (data, options) => {
    // 从schema到React组件映射时，修正传入React组件的配置项
    return data;
  }
});

const noop = a => a;

const layout = {
  labelCol: { span: 8 },
  wrapperCol: { span: 16 }
};
// 中间层，接入antd或其他form，把field上的配置映射到组件的字段上
const RenderFields = ({ fields, form }: any) => {
  // console.table(fields);
  return (
    <NForm {...layout}>
      {fields.map(f => {
        const Component = CompMap[f.component];
        return <Component key={f.key} fieldConfig={f} form={form} />;
      })}
    </NForm>
  );
};

type Operator =
  | "="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<="
  | "contains"
  | "not_contains"
  | "empty"
  | "not_empty";
type CheckItem =
  | {
      field: string;
      operator: Operator;
      value: string | number | boolean;
      valueType?: "string" | "number" | "boolean";
    }
  | {
      mode: Mode;
    };
const genOrList = (
  originCheckList: CheckItem[][],
  mode: Mode,
  cb: (con: CheckItem) => void
) => {
  return originCheckList.map(andList => {
    const checkAndList = [] as Function[];
    andList.forEach(con => {
      if (con.mode) {
        checkAndList.push(() => con.mode === mode);
        return;
      }
      const value =
        con.valueType === "number"
          ? Number(con.value)
          : con.valueType === "boolean"
          ? Boolean(con.value)
          : con.value;
      switch (con.operator) {
        case "=":
          checkAndList.push((data: any) => get(data, con.field) === value);
          break;
        case "!=":
          checkAndList.push((data: any) => get(data, con.field) !== value);
          break;
        case ">":
          checkAndList.push((data: any) => get(data, con.field) >= value);
          break;
        case ">=":
          checkAndList.push((data: any) => get(data, con.field) >= value);
          break;
        case "<":
          checkAndList.push((data: any) => get(data, con.field) < value);
          break;
        case "<=":
          checkAndList.push((data: any) => get(data, con.field) <= value);
          break;
        case "contains":
          checkAndList.push((data: any) =>
            get(data, con.field).includes(value)
          );
          break;
        case "not_contains":
          checkAndList.push(
            (data: any) => !get(data, con.field).includes(value)
          );
          break;
        case "empty":
          checkAndList.push(() => value === undefined);
          break;
        case "not_empty":
          checkAndList.push(() => value !== undefined);
          break;
        default:
          break;
      }
      cb(con);
    });
    return checkAndList;
  });
};

const genCheckFn = (orList: Function[][]) => {
  return (data: any) =>
    orList.reduce((res, andList) => {
      return andList.reduce((cur, fn) => fn(data) && cur, true) || res;
    }, false);
};

// { pattern: '', type: 'string | number | email', whitespace, enum, len, min: 1, max: 12, equal: 'string:sss' | 'number:123' | 'boolean:false', not_equal: '', msg: '' },
const rules = {
  pattern(v: any, rule: Rule, data: any) {
    return [new RegExp(rule.pattern).test(v), rule.msg || "not match pattern"];
  },
  enum(v: any, rule: Rule, data: any) {
    return [rule.enum.includes(v), rule.msg || "not in enum"];
  },
  string(v: any, rule: Rule, data: any) {
    return [typeof v === "string", rule.msg || "not a string"];
  },
  number(v: any, rule: Rule, data: any) {
    return [typeof v === "number", rule.msg || "not a number"];
  },
  len(v: any, rule: Rule, data: any) {
    return [v.length === rule.len, rule.msg || `length is not:${rule.len}`];
  },
  min(v: any, rule: Rule, data: any) {
    return [
      v.length >= rule.min,
      rule.msg || `length is smaller than:${rule.min}`
    ];
  },
  max(v: any, rule: Rule, data: any) {
    return [
      v.length <= rule.max,
      rule.msg || `length is bigger than:${rule.max}`
    ];
  },
  equalWith(v: any, rule: Rule, data: any) {
    const _v = get(data, rule.equalWith);
    return [v === _v, rule.msg || `not equal with:${_v}`];
  },
  // whitespace(v: any, rule: Rule, data: any) {
  //   return [true, ''];
  // },
  validator(v: any, rule: Rule, data: any) {
    return rule.validator(v, rule, data);
  }
};

const getCheckListFromRule = (rule: Rule) => {
  const checkList = [];
  rule.pattern !== undefined && checkList.push(rules.pattern);
  rule.enum !== undefined && checkList.push(rules.enum);
  rule.string !== undefined && checkList.push(rules.string);
  rule.number !== undefined && checkList.push(rules.number);
  rule.len !== undefined && checkList.push(rules.len);
  rule.min !== undefined && checkList.push(rules.min);
  rule.max !== undefined && checkList.push(rules.max);
  rule.equalWith !== undefined && checkList.push(rules.equalWith);
  rule.validator !== undefined && checkList.push(rules.validator);
  return checkList;
};

const genValidateFn = (item: InnerFormField, cb = noop) => (data: any) => {
  for (const rule of item.rules) {
    const checkList = getCheckListFromRule(rule);
    for (const check of checkList) {
      const result = check(get(data, item.key), rule, data); // 返回 [status: 'success' | 'error', msg: '']
      if (isPromise(result)) {
        // @ts-ignore
        result.then(cb);
        return ["validating", "异步校验中...", result];
      } else if (result[0] === false) {
        return ["error", result[1]];
      } else if (typeof result[0] === "string") {
        return result;
      }
    }
  }
  return ["success"];
};

interface Rule {
  // (v: any, formData: any): ValidateResult | PromiseLike<ValidateResult>
  msg: string;
  pattern?: string;
  string?: boolean;
  number?: boolean;
  email?: boolean;
  phone?: boolean;
  whitespace?: boolean;
  enum?: string[] | number[];
  len?: number;
  min?: number;
  max?: number;
  equalWith?: string; // 和其他字段值一样，用于校验密码时
  validator?(v: any): Promise<any>;
}

type validateTrigger = "onChange" | "onBlur";
interface FormField {
  index: number; // 顺序编号，在动态变化时确保顺序
  label: string; // 标签
  key: string; // 字段名，唯一的key，支持嵌套
  type: string;
  component: string;
  value?: any;
  labelTip?: string;
  defaultValue?: any; // 重置时不会清掉
  initialValue?: any; // 仅在mount后set，重置会清掉
  rules?: Rule[];
  required?: boolean;
  validateTrigger?: validateTrigger | validateTrigger[];
  componentProps?: {
    [k: string]: any;
  };
  wrapperProps?: {
    [k: string]: any;
  };
  hideWhen?: CheckItem[][];
  disableWhen?: CheckItem[][];
  removeWhen?: CheckItem[][];
  fixData?(v: any): any;
}

type ValidateResult = [boolean, string, PromiseLike<ValidateResult>?];
interface InnerFormField extends FormField {
  visible: boolean;
  remove: boolean;
  disabled: boolean;
  valid: [boolean?, string?, PromiseLike<ValidateResult>?];
  rules: Rule[];
  isTouched: boolean;
  validateTrigger: validateTrigger | validateTrigger[];
  _hideWatchers: string[];
  _hideSubscribes: string[];
  _disabledWatchers: string[];
  _disabledSubscribes: string[];
  _removeWatchers: string[];
  _removeSubscribes: string[];
  validate(data: any): ValidateResult;
  checkHide(data: any): boolean;
  checkDisabled(data: any): boolean;
  checkRemove(data: any): boolean;
  registerRequiredCheck: (a: any) => any;
  getData: () => any;
}

type Mode = "create" | "edit";
interface FormProp {
  formRef: any;
  fields: FormField[];
  value?: {
    [k: string]: any;
  };
  onChange(vs: any): any;
}
export const Form = ({
  formRef: _ref,
  fields,
  value,
  onChange = noop
}: FormProp) => {
  console.log(value);
  const mode = Object.keys(value || {}).length ? "edit" : "create";
  const formDataRef = React.useRef(value || {});
  const defaultDataRef = React.useRef({});
  const fieldMapRef = React.useRef({});
  const [_fields, setFields] = React.useState([] as InnerFormField[]);

  const formRef = React.useRef({
    setFieldValue: (k: string, v: any) => {
      // console.log('k, v:', k, v);
      set(formDataRef.current, k, v);
      setFields(prev => {
        const fieldMap = {};
        prev.forEach(f => {
          fieldMap[f.key] = f;
        });
        const visibleChangeMap = {};
        const removeChangeMap = {};
        const disabledChangeMap = {};
        const newList = prev.map(item => {
          if (item.key === k) {
            const copy = { ...item }; // 改变引用，触发重渲染
            copy.value = v;
            copy.isTouched = true;
            if (copy.validateTrigger.includes("onChange")) {
              copy.valid = copy.validate(formDataRef.current);
            }
            // 检查依赖的field是否要移除或隐藏，需要的标记一下，本次循环无法更新，放到后面再循环一次时处理
            const {
              _removeSubscribes,
              _hideSubscribes,
              _disabledSubscribes
            } = copy;
            _removeSubscribes.forEach(sk => {
              const sub = fieldMap[sk];
              const thisResult = sub.checkRemove(formDataRef.current);
              if (sub.remove !== thisResult) {
                removeChangeMap[sub.key] = thisResult;
              }
            });
            _hideSubscribes.forEach(sk => {
              const sub = fieldMap[sk];
              const thisResult = !sub.checkHide(formDataRef.current);
              if (sub.visible !== thisResult) {
                visibleChangeMap[sub.key] = thisResult;
              }
            });
            _disabledSubscribes.forEach(sk => {
              const sub = fieldMap[sk];
              const thisResult = sub.checkDisabled(formDataRef.current);
              if (sub.disabled !== thisResult) {
                disabledChangeMap[sub.key] = thisResult;
              }
            });
            return copy;
          }
          return item;
        });
        return newList.map(f => {
          let newF = f;
          if (removeChangeMap[f.key] !== undefined) {
            newF = { ...f, remove: removeChangeMap[f.key] }; // 改变field的引用，触发重渲染
          }
          if (visibleChangeMap[f.key] !== undefined) {
            newF = { ...f, visible: visibleChangeMap[f.key] };
          }
          if (disabledChangeMap[f.key] !== undefined) {
            newF = { ...f, disabled: disabledChangeMap[f.key] };
          }
          return newF;
        });
      });
      onChange(cloneDeep(formDataRef.current));
    },
    setFieldValid: (k: string, v: any) => {
      setFields(prev =>
        prev.map(item => {
          return item.key === k ? { ...item, valid: v } : item;
        })
      );
    },
    setFields,
    isFieldTouched(k: string) {
      return !!fieldMapRef.current[k].isTouched; // 这里_fields是空数组，是个闭包
    },
    validate() {
      const asyncKeys = [] as string[];
      const asyncChecks = [] as PromiseLike<ValidateResult>[];
      const checkInfo = {};
      setFields(prev =>
        prev.map(item => {
          const prevResult = item.valid;
          const newResult = item.validate(formDataRef.current);
          if (newResult[2]) {
            asyncKeys.push(item.key);
            asyncChecks.push(newResult[2]);
          } else {
            checkInfo[item.key] = newResult;
          }
          if (
            prevResult[0] !== newResult[0] ||
            prevResult[1] !== newResult[1]
          ) {
            return { ...item, valid: newResult };
          }
          return item;
        })
      );
      if (asyncChecks.length) {
        return Promise.all(asyncChecks).then(rs => {
          const asyncResult = {};
          asyncKeys.forEach((k, i) => {
            asyncResult[k] = rs[i];
          });
          return { ...checkInfo, ...asyncResult };
        });
      }
      return Promise.resolve(checkInfo);
    },
    reset: (k?: string) => {
      if (k) {
        const defaultV = get(defaultDataRef.current, k);
        set(formDataRef.current, k, defaultV);
      } else {
        formDataRef.current = merge({}, defaultDataRef.current, value);
      }
      setFields(prev => {
        // 保持当前field，只重置数据等，而不是直接恢复到原始状态
        return prev.map(item => {
          const copy = { ...item };
          copy.value = get(formDataRef.current, copy.key);
          copy.isTouched = false;
          copy.valid = [];
          copy.visible = !copy.checkHide(formDataRef.current);
          copy.remove = copy.checkRemove(formDataRef.current);
          return copy;
        });
      });
    },
    getData: () => {
      const data = {};
      Object.keys(fieldMapRef.current).forEach(k => {
        set(data, k, get(fieldMapRef.current, k).getData());
      });
      return data;
      // return cloneDeep(formDataRef.current);
    }
  });

  // console.count("render");
  useMount(() => {
    const copyFields = cloneDeep(fields) as InnerFormField[];
    _ref.current = formRef.current;
    const _initialData = {};
    copyFields.forEach(f => {
      if (f.defaultValue !== undefined) {
        set(defaultDataRef.current, f.key, f.defaultValue);
      }
      if (f.initialValue !== undefined) {
        set(_initialData, f.key, f.initialValue);
      }
    });
    console.log(defaultDataRef.current);
    console.log(_initialData);
    console.log(formDataRef.current);
    formDataRef.current = merge(
      {},
      defaultDataRef.current,
      _initialData,
      formDataRef.current
    );
    // 解析hideWhen、removeWhen，调整_fields
    setFields(() => {
      const fieldMap = {};
      copyFields.forEach(f => {
        f._hideSubscribes = [];
        f._removeSubscribes = [];
        f._disabledSubscribes = [];
        f._hideWatchers = [];
        f._removeWatchers = [];
        f._disabledWatchers = [];
        fieldMap[f.key] = f;
      });
      return copyFields.map(item => {
        // 初始化value
        item.value = get(formDataRef.current, item.key);
        console.log("**** ", item.key, item.value, value);
        if (!Array.isArray(item.rules)) {
          item.rules = [];
        }
        item.registerRequiredCheck = fn => {
          if (item.required && typeof fn === "function") {
            item.rules.unshift(fn);
          }
          item.registerRequiredCheck = noop;
        };
        item.validate = genValidateFn(item, res => {
          setFields(prev =>
            prev.map(p => (p.key === item.key ? { ...p, valid: res } : p))
          );
        });
        if (item.validateTrigger === undefined) {
          item.validateTrigger = ["onChange"];
        } else if (typeof item.validateTrigger === "string") {
          item.validateTrigger = [item.validateTrigger];
        }
        if (!item.componentProps) {
          item.componentProps = {};
        }
        if (!item.wrapperProps) {
          item.wrapperProps = {};
        }
        if (item.validateTrigger.includes("onBlur")) {
          const originOnBlur = item.componentProps.onBlur;
          item.componentProps.onBlur = (...args: any) => {
            (originOnBlur || noop)(...args);
            // 因为onChange肯定在onBlur前触发，data是最新的
            setFields(prev =>
              prev.map(p =>
                p.key === item.key
                  ? { ...p, valid: item.validate(formDataRef.current) }
                  : p
              )
            );
          };
        }
        item.validate = genValidateFn(item, res => {
          setFields(prev =>
            prev.map(p => (p.key === item.key ? { ...p, valid: res } : p))
          );
        });
        item.valid = [];
        if (item.hideWhen) {
          item.checkHide = genCheckFn(
            genOrList(item.hideWhen, mode, con => {
              item._hideWatchers.push(con.field); // 依赖于谁，做提示用
              fieldMap[con.field]._hideSubscribes.push(item.key); // 被谁依赖，触发依赖的更新
            })
          );
        } else {
          item.checkHide = () => false;
        }
        item.visible = !item.checkHide(formDataRef.current);
        if (item.removeWhen) {
          item.checkRemove = genCheckFn(
            genOrList(item.removeWhen, mode, con => {
              item._removeWatchers.push(con.field);
              fieldMap[con.field]._removeSubscribes.push(item.key);
            })
          );
        } else {
          item.checkRemove = () => false;
        }
        item.remove = item.checkRemove(formDataRef.current);
        if (item.disableWhen) {
          item.checkDisabled = genCheckFn(
            genOrList(item.disableWhen, mode, con => {
              item._disabledWatchers.push(con.field);
              fieldMap[con.field]._disabledSubscribes.push(item.key);
            })
          );
        } else {
          item.checkDisabled = () => false;
        }
        item.disabled = item.checkDisabled(formDataRef.current);
        item.getData = () => (item.fixData || noop)(item.value);
        return item;
      });
    });
  });

  React.useEffect(() => {
    _fields.forEach(f => {
      fieldMapRef.current[f.key] = f;
    });
  }, [_fields]);

  if (!_fields.length) return null;

  // 渲染前排序
  const sortFields = _fields
    .filter(f => !f.remove)
    .sort((a, b) => a.index - b.index);

  /**
   * field:
   *   value: any
   *   dataSource: static | dynamic
   *   visible: boolean
   *   valid: {msg, status}
   *   validate(): {msg, status}
   *   checkHide(): boolean
   *   checkRemove(): boolean
   */
  return <RenderFields fields={sortFields} form={formRef.current} />;
};
